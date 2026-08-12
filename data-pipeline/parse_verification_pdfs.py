#!/usr/bin/env python3
"""Parse CETS verification-institution PDFs into analysis-ready JSON and CSV.

The parser is deliberately fail-closed: it always writes a candidate dataset and
QA report, but only replaces the public website dataset when every configured
quality gate passes.  PDFs that contain too little embedded text are marked for
OCR/manual review instead of being silently treated as empty records.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pypdf import PdfReader
import pdfplumber


YEAR_RE = re.compile(r"[（(]\s*(20\d{2})\s*年度核查\s*[）)]")
PAGE_NUMBER_RE = re.compile(r"^[—\-–]\s*\d+\s*[—\-–]$")
USCC_RE = re.compile(r"[0-9A-Z]{18}")
ORG_CODE_RE = re.compile(r"[0-9A-Z]{9,18}")
SUMMARY_RE = re.compile(
    r"共出具\s*(\d+)\s*份.*?其中[：:]\s*(\d+)\s*份合格[，,]\s*(\d+)\s*份不合格[，,]\s*合格率\s*([0-9.]+)\s*%",
    re.S,
)
SUMMARY_FLEX_RE = re.compile(
    r"(?:共出具\s*)?(\d+)\s*份.*?其中[：:]?\s*(\d+)\s*份合格[，,]?\s*(\d+)\s*份不合格[，,]?\s*合格率\s*([0-9.]+)\s*%",
    re.S,
)


def read_json(path: Path, fallback: Any = None) -> Any:
    if not path.exists():
        if fallback is not None:
            return fallback
        raise FileNotFoundError(path)
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_space(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def compact(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or ""))


def stable_pdf_url(value: str) -> str:
    return value.split("?", 1)[0].split("#", 1)[0]


def flatten_manifest(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        for key in ("records", "items", "manifest"):
            if isinstance(raw.get(key), list):
                return raw[key]
        if isinstance(raw.get("urls"), list):
            return [{"pdf_url": url} for url in raw["urls"]]
    raise ValueError("Unsupported manifest format; expected a list or an object with records/items/urls")


def canonical_manifest_record(row: dict[str, Any]) -> dict[str, Any]:
    pdf_url = stable_pdf_url(str(row.get("pdf_url") or row.get("url") or row.get("enclosure") or ""))
    filename = str(row.get("pdf_filename") or "")
    if not filename and pdf_url:
        filename = pdf_url.rsplit("/", 1)[-1]
    return {
        **row,
        "verification_list_id": str(row.get("verification_list_id") or row.get("id") or ""),
        "pdf_url": pdf_url,
        "pdf_filename": filename,
    }


def extract_pdf(path: Path) -> tuple[str, list[str], int, list[int]]:
    reader = PdfReader(str(path))
    pages: list[str] = []
    page_chars: list[int] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        pages.append(text)
        page_chars.append(len(compact(text)))
    text = "\n".join(pages)
    lines = [normalize_space(line) for line in text.splitlines()]
    lines = [line for line in lines if line and not PAGE_NUMBER_RE.match(line)]
    return text, lines, len(reader.pages), page_chars


def slice_compact(text: str, start_markers: tuple[str, ...], end_markers: tuple[str, ...]) -> str:
    collapsed = compact(text)
    starts = [collapsed.find(marker) for marker in start_markers if collapsed.find(marker) >= 0]
    if not starts:
        return ""
    start = min(starts)
    ends = [collapsed.find(marker, start + 1) for marker in end_markers if collapsed.find(marker, start + 1) >= 0]
    end = min(ends) if ends else len(collapsed)
    return collapsed[start:end]


def value_between(collapsed: str, starts: tuple[str, ...], ends: tuple[str, ...]) -> str:
    for start_marker in starts:
        start = collapsed.find(start_marker)
        if start < 0:
            continue
        start += len(start_marker)
        candidates = [collapsed.find(end, start) for end in ends if collapsed.find(end, start) >= 0]
        end = min(candidates) if candidates else len(collapsed)
        return collapsed[start:end].strip("：:，,。;；")
    return ""


def parse_basic_fields(text: str, lines: list[str]) -> dict[str, Any]:
    collapsed = compact(text)
    basic = slice_compact(text, ("一、技术服务机构基本信息",), ("二、技术服务机构内部管理情况",))

    year_match = YEAR_RE.search(text)
    year = int(year_match.group(1)) if year_match else None

    institution_name = value_between(
        basic,
        ("技术服务机构名称", "名称"),
        ("统一社会信用代码", "统一社会信用"),
    )
    institution_name = re.sub(r"^(名称)+", "", institution_name)

    uscc = ""
    uscc_region = value_between(
        basic,
        ("统一社会信用代码", "统一社会信用"),
        ("法定代表人",),
    )
    uscc_match = USCC_RE.search(uscc_region)
    if uscc_match:
        uscc = uscc_match.group(0)

    legal_representative = value_between(basic, ("法定代表人",), ("注册资金", "注册资本"))

    capital_region = value_between(basic, ("注册资金", "注册资本"), ("办公场所", "办公地址"))
    capital_match = re.search(r"([0-9]+(?:\.[0-9]+)?)", capital_region)
    capital_amount = float(capital_match.group(1)) if capital_match else None
    if capital_amount is not None and capital_amount.is_integer():
        capital_amount = int(capital_amount)
    capital_unit = ""
    if "万人民币" in capital_region or "万元人民币" in capital_region:
        capital_unit = "万元人民币"
    elif "万元" in capital_region:
        capital_unit = "万元"
    elif "人民币" in capital_region:
        capital_unit = "人民币元"

    office_address = value_between(basic, ("办公场所", "办公地址"), ("联系人",))
    contact_region = value_between(basic, ("联系人",), ("二、技术服务机构内部管理情况",))
    contact_name = ""
    contact_details = ""
    contact_label = re.search(r"联系方式[（(]?(?:电话、?email|电话及邮箱|电话|邮箱)?[）)]?", contact_region, re.I)
    if contact_label:
        contact_name = contact_region[: contact_label.start()].strip("：:")
        contact_details = contact_region[contact_label.end() :].strip("：:")
    else:
        contact_details = contact_region

    internal = slice_compact(text, ("二、技术服务机构内部管理情况",), ("三、核查工作及时性和工作质量",))
    bad_record = value_between(internal, ("不良记录",), ("三、核查工作及时性和工作质量",))
    bad_record = bad_record.rstrip("。")

    summary_match = SUMMARY_RE.search(text) or SUMMARY_FLEX_RE.search(text)
    if summary_match:
        target_count = int(summary_match.group(1))
        qualified_count = int(summary_match.group(2))
        unqualified_count = int(summary_match.group(3))
        pass_rate = float(summary_match.group(4)) / 100
    else:
        count_match = re.search(r"共出具\s*(\d+)\s*份", text)
        rate_match = re.search(r"合格率\s*([0-9.]+)\s*%", text)
        target_count = int(count_match.group(1)) if count_match else None
        qualified_count = None
        unqualified_count = None
        pass_rate = float(rate_match.group(1)) / 100 if rate_match else None

    # Some source PDFs place the next row number inside the previous row and
    # its status before the remaining name/code cells.  In that layout the
    # explicit sequence labels are a more reliable count than the prose
    # summary, which occasionally differs by one.
    table_start = header_end_index(lines)
    table_end = next(
        (i for i, line in enumerate(lines) if re.search(r"(?:共出具|核查结论).*合格率", line)),
        len(lines),
    )
    sequence_numbers = [int(line) for line in lines[table_start:table_end] if line.isdigit()]
    sequence_count = max(sequence_numbers, default=0)
    if target_count is not None and sequence_count and abs(target_count - sequence_count) == 1:
        target_count = sequence_count

    return {
        "year": year,
        "institution_name": institution_name,
        "unified_social_credit_code": uscc,
        "legal_representative": legal_representative,
        "registered_capital_amount": capital_amount,
        "registered_capital_unit": capital_unit,
        "office_address": office_address,
        "contact_name": contact_name,
        "contact_details": contact_details,
        "bad_record": bad_record,
        "target_count": target_count,
        "summary_target_count": int(summary_match.group(1)) if summary_match else target_count,
        "qualified_count": qualified_count,
        "unqualified_count": unqualified_count,
        "pass_rate": pass_rate,
        "text_line_count": len(lines),
        "text_character_count": len(compact(text)),
        "collapsed_text": collapsed,
    }


def header_end_index(lines: list[str]) -> int:
    for index, line in enumerate(lines):
        if "7其他内容" in compact(line):
            return index + 1
    for index, line in enumerate(lines):
        if "三、核查工作及时性和工作质量" in line:
            return index + 1
    return 0


def clean_target_name(value: str) -> str:
    value = re.sub(r"^[：:，,。;；]+|[：:，,。;；]+$", "", value)
    value = value.replace("重点排放单位名称", "")
    return value


def parse_targets(lines: list[str], expected_count: int | None) -> list[dict[str, Any]]:
    start = header_end_index(lines)
    summary_index = next(
        (i for i, line in enumerate(lines) if re.search(r"(?:共出具|核查结论).*合格率", line)),
        len(lines),
    )
    targets: list[dict[str, Any]] = []
    cursor = start
    expected_order = 1
    first_row_without_number_used = False
    pending_prefix: list[str] = []

    while cursor < summary_index:
        marker = None
        marker_was_pending = False
        if pending_prefix:
            marker = cursor - 1
            marker_was_pending = True
        for index in range(cursor, summary_index):
            if marker_was_pending:
                break
            if lines[index].isdigit() and int(lines[index]) == expected_order:
                marker = index
                break
        if marker is None:
            if expected_order == 1 and not first_row_without_number_used:
                marker = start - 1
                first_row_without_number_used = True
            else:
                break

        row_start = cursor if marker_was_pending else marker + 1
        status_index = None
        for index in range(row_start, summary_index):
            if re.search(r"不及时|及时", lines[index]):
                status_index = index
                break
        if status_index is None:
            break

        row_lines = lines[row_start:status_index]
        embedded_next_marker = None
        for offset, value in enumerate(row_lines):
            if value.isdigit() and int(value) == expected_order + 1:
                embedded_next_marker = row_start + offset
                break
        current_end = embedded_next_marker if embedded_next_marker is not None else status_index
        prefix = compact("".join(pending_prefix + lines[row_start:current_end]))
        code_matches = list(re.finditer(r"[0-9A-Z]{9,18}", prefix))
        code_match = code_matches[-1] if code_matches else None
        if not code_match:
            cursor = status_index + 1
            expected_order += 1
            continue

        target_uscc = code_match.group(0)
        code_start = code_match.start()
        if code_match.end() < len(prefix) and prefix[code_match.end():].isdigit() and len(target_uscc) < 18:
            suffix = prefix[code_match.end():]
            target_uscc += suffix[: 18 - len(target_uscc)]
        target_name = clean_target_name(prefix[:code_start])
        status_text = lines[status_index]
        timeliness = "不及时" if "不及时" in status_text else "及时"
        result = "不符合" if "不符合" in status_text else ("符合" if "符合" in status_text else "未披露")
        targets.append(
            {
                "target_order": expected_order,
                "target_entity_name": target_name,
                "target_uscc": target_uscc,
                "timeliness": timeliness,
                "result": result,
            }
        )
        if embedded_next_marker is not None:
            pending_prefix = lines[embedded_next_marker + 1 : status_index]
            cursor = status_index + 1
        else:
            pending_prefix = []
            cursor = status_index + 1
        expected_order += 1
        if expected_count is not None and expected_order > expected_count:
            break

    return targets


def parse_targets_from_tables(path: Path) -> list[dict[str, Any]]:
    """Extract target rows using the PDF's ruled-table geometry.

    Some CETS PDFs split a logical row across page boundaries.  Text-flow
    extraction then places the next row's status before the remainder of its
    name and credit code.  The ruled table preserves column boundaries, so we
    merge continuation rows into the last numbered row before validating it.
    """
    parsed: list[dict[str, Any]] = []
    by_order: dict[int, dict[str, Any]] = {}
    next_implicit_order = 1
    pending_implicit: dict[str, Any] | None = None
    target_table_started = False
    with pdfplumber.open(path) as document:
        for page in document.pages:
            for table in page.extract_tables():
                has_target_columns = any(
                    any("重点排放" in normalize_space(cell) or "核查及时" in normalize_space(cell) for cell in row)
                    for row in table
                )
                if has_target_columns and not target_table_started:
                    by_order = {}
                    parsed = []
                    next_implicit_order = 1
                    pending_implicit = None
                    target_table_started = True
                if not target_table_started:
                    continue
                for cells in table:
                    values = [normalize_space(cell) for cell in cells]
                    if not values:
                        continue
                    first = values[0]
                    continuation_has_status = len(values) > 3 and (
                        "及时" in values[3] or "不及时" in values[3]
                    )
                    if (
                        len(values) >= 3
                        and pending_implicit
                        and (values[1] or values[2])
                        and (not continuation_has_status or not pending_implicit["timeliness"])
                    ):
                        row = pending_implicit
                        if values[1]:
                            row["target_entity_name"] += compact(values[1])
                        if values[2]:
                            row["target_uscc"] += compact(values[2])
                        if continuation_has_status:
                            row["timeliness"] = "不及时" if "不及时" in values[3] else "及时"
                            if any("不符合" in value for value in values[4:]):
                                row["result"] = "不符合"
                            elif any("符合" in value for value in values[4:]):
                                row["result"] = "符合"
                        code_candidate = compact(row["target_uscc"])
                        if len(code_candidate) >= 18 and row["timeliness"]:
                            pending_implicit = None
                        else:
                            pending_implicit = row
                        continue
                    if first.isdigit():
                        order = int(first)
                        row = {
                            "target_order": order,
                            "target_entity_name": clean_target_name(compact(values[1] if len(values) > 1 else "")),
                            "target_uscc": compact(values[2] if len(values) > 2 else ""),
                            "timeliness": "不及时" if "不及时" in (values[3] if len(values) > 3 else "") else ("及时" if "及时" in (values[3] if len(values) > 3 else "") else ""),
                            "result": "不符合" if any("不符合" in value for value in values[4:]) else ("符合" if any("符合" in value for value in values[4:]) else "未披露"),
                        }
                        by_order[order] = row
                        next_implicit_order = max(next_implicit_order, order + 1)
                        pending_implicit = row if len(compact(row["target_uscc"])) < 18 else None
                    elif (
                        len(values) >= 4
                        and values[1]
                        and values[2]
                        and "及时" in values[3]
                        and by_order
                        and not pending_implicit
                        and compact(values[2]) not in by_order[max(by_order)]["target_uscc"]
                    ):
                        order = max(by_order) + 1
                        row = {
                            "target_order": order,
                            "target_entity_name": compact(values[1]),
                            "target_uscc": compact(values[2]),
                            "timeliness": "不及时" if "不及时" in values[3] else "及时",
                            "result": "不符合" if any("不符合" in value for value in values[4:]) else ("符合" if any("符合" in value for value in values[4:]) else "未披露"),
                        }
                        by_order[order] = row
                        next_implicit_order = order + 1
                        pending_implicit = row if len(row["target_uscc"]) < 18 else None
                    elif len(values) >= 4 and values[1] and values[2] and (
                        "及时" in values[3] or "不及时" in values[3]
                    ):
                        order = next_implicit_order
                        while order in by_order:
                            order += 1
                        row = {
                            "target_order": order,
                            "target_entity_name": "",
                            "target_uscc": "",
                            "timeliness": "",
                            "result": "未披露",
                        }
                        by_order[order] = row
                        next_implicit_order = order + 1
                        if len(values) > 1 and values[1]:
                            row["target_entity_name"] += compact(values[1])
                        if len(values) > 2 and values[2]:
                            row["target_uscc"] += compact(values[2])
                        if len(values) > 3 and values[3]:
                            row["timeliness"] = "不及时" if "不及时" in values[3] else ("及时" if "及时" in values[3] else row["timeliness"])
                        if any("不符合" in value for value in values[4:]):
                            row["result"] = "不符合"
                        elif any("符合" in value for value in values[4:]) and row["result"] == "未披露":
                            row["result"] = "符合"
                        code_candidate = compact(row["target_uscc"])
                        if len(code_candidate) >= 18 and row["timeliness"]:
                            pending_implicit = None
                        else:
                            pending_implicit = row

    for order in sorted(by_order):
        row = by_order[order]
        # PDF font mappings occasionally expose credit-code letters as
        # lowercase (for example c/w).  USCCs are uppercase by definition.
        code_text = row["target_uscc"].upper()
        codes = list(re.finditer(r"[0-9A-Z]{9,18}", code_text))
        if not codes:
            continue
        row["target_uscc"] = codes[-1].group(0)
        if len(row["target_uscc"]) != 18 or not row["target_entity_name"]:
            continue
        row["target_entity_name"] = re.sub(r"^重点排放单位名称", "", row["target_entity_name"])
        parsed.append(row)
    if parsed and parsed[0]["target_order"] > 1:
        parsed = [
            {**row, "target_order": index}
            for index, row in enumerate(parsed, start=1)
        ]
    return parsed


def infer_industry(
    year: int | None,
    targets: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
    emitter_industries: dict[tuple[str, str], set[str]],
) -> tuple[str, str]:
    if len(candidates) == 1:
        return str(candidates[0].get("industry") or ""), "single_candidate"
    target_codes = [str(row.get("target_uscc") or "") for row in targets]
    scores: Counter[str] = Counter()
    for target_code in target_codes:
        for industry in emitter_industries.get((str(year or ""), target_code), set()):
            scores[industry] += 1
    candidate_industries = {str(row.get("industry") or "") for row in candidates}
    ranked = [(score, industry) for industry, score in scores.items() if industry in candidate_industries]
    ranked.sort(reverse=True)
    if ranked and (len(ranked) == 1 or ranked[0][0] > ranked[1][0]):
        return ranked[0][1], "target_overlap"
    return "", "ambiguous"


def match_list_record(
    manifest_row: dict[str, Any],
    basic: dict[str, Any],
    targets: list[dict[str, Any]],
    list_by_id: dict[str, dict[str, Any]],
    list_by_org_year: dict[tuple[str, str], list[dict[str, Any]]],
    emitter_industries: dict[tuple[str, str], set[str]],
    used_list_ids: set[str],
) -> tuple[dict[str, Any] | None, str]:
    record_id = str(manifest_row.get("verification_list_id") or "")
    if record_id and record_id in list_by_id:
        return list_by_id[record_id], "manifest_id"

    key = (str(basic.get("year") or ""), str(basic.get("unified_social_credit_code") or ""))
    candidates = [row for row in list_by_org_year.get(key, []) if row.get("verification_list_id") not in used_list_ids]
    if not candidates:
        key = (str(basic.get("year") or ""), str(basic.get("institution_name") or ""))
        candidates = [row for row in list_by_org_year.get(key, []) if row.get("verification_list_id") not in used_list_ids]
    if not candidates:
        return None, "no_candidate"

    industry, industry_method = infer_industry(basic.get("year"), targets, candidates, emitter_industries)
    if industry:
        industry_matches = [row for row in candidates if str(row.get("industry") or "") == industry]
        if len(industry_matches) == 1:
            return industry_matches[0], industry_method
    if len(candidates) == 1:
        return candidates[0], "single_candidate"
    return None, "ambiguous"


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--pdf-dir", type=Path, required=True)
    parser.add_argument("--verification-list", type=Path, required=True)
    parser.add_argument("--key-emitters", type=Path)
    parser.add_argument("--existing-json", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--publish-json", type=Path)
    parser.add_argument("--publish-table-dir", type=Path)
    parser.add_argument("--min-coverage", type=float, default=1.0)
    parser.add_argument("--allow-partial", action="store_true")
    parser.add_argument("--allow-source-missing-pdf", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    captured_at = datetime.now(timezone.utc).isoformat()
    manifest = [canonical_manifest_record(row) for row in flatten_manifest(read_json(args.manifest))]
    verification_list = read_json(args.verification_list)
    key_emitters = read_json(args.key_emitters, []) if args.key_emitters else []
    existing = read_json(args.existing_json, {"details": [], "targets": []}) if args.existing_json else {"details": [], "targets": []}
    existing_details_by_id = {
        str(row.get("verification_list_id") or ""): row for row in existing.get("details", [])
    }
    existing_targets_by_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in existing.get("targets", []):
        existing_targets_by_id[str(row.get("verification_list_id") or "")].append(row)

    list_by_id = {str(row.get("verification_list_id")): row for row in verification_list}
    list_by_org_year: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in verification_list:
        year = str(row.get("year") or "")
        list_by_org_year[(year, str(row.get("unified_social_credit_code") or ""))].append(row)
        list_by_org_year[(year, str(row.get("institution_name") or ""))].append(row)

    emitter_industries: dict[tuple[str, str], set[str]] = defaultdict(set)
    for row in key_emitters:
        emitter_industries[(str(row.get("year") or ""), str(row.get("unified_social_credit_code") or ""))].add(
            str(row.get("industry") or "")
        )

    details: list[dict[str, Any]] = []
    targets_out: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []
    used_list_ids: set[str] = set()
    parsed_cache: dict[str, tuple[dict[str, Any], list[dict[str, Any]], int, list[int], str]] = {}

    for position, manifest_row in enumerate(manifest, start=1):
        filename = manifest_row.get("pdf_filename") or ""
        pdf_path = args.pdf_dir / filename
        manifest_id = str(manifest_row.get("verification_list_id") or "")
        existing_detail = existing_details_by_id.get(manifest_id)
        can_reuse_existing = bool(
            existing_detail
            and filename
            and filename == str(existing_detail.get("pdf_filename") or "")
            and stable_pdf_url(str(existing_detail.get("pdf_url") or "")) == str(manifest_row.get("pdf_url") or "")
            and bool(existing.get("quality", {}).get("publish_ready"))
            and existing_detail.get("parse_status") not in {"needs_ocr", "needs_list_match"}
        )
        if not filename or not pdf_path.exists():
            if can_reuse_existing:
                reused_detail = {**existing_detail, "reused_from_existing": True}
                details.append(reused_detail)
                targets_out.extend(existing_targets_by_id.get(manifest_id, []))
                used_list_ids.add(manifest_id)
                continue
            source_missing = not manifest_row.get("pdf_url") or bool(manifest_row.get("pdf_url_source") == "missing_at_source")
            issues.append({
                "severity": "warning" if args.allow_source_missing_pdf else "error",
                "code": "source_missing_pdf" if source_missing else "source_unavailable_pdf",
                "manifest_position": position,
                "verification_list_id": manifest_id,
                "pdf_filename": filename,
                "pdf_url": manifest_row.get("pdf_url") or "",
            })
            continue
        if pdf_path.stat().st_size < 1024 or pdf_path.read_bytes()[:5] != b"%PDF-":
            issues.append({"severity": "error", "code": "invalid_pdf", "manifest_position": position, "pdf_filename": filename})
            continue

        if filename not in parsed_cache:
            try:
                text, lines, page_count, page_chars = extract_pdf(pdf_path)
                basic = parse_basic_fields(text, lines)
                parsed_targets = parse_targets_from_tables(pdf_path)
                if not parsed_targets:
                    parsed_targets = parse_targets(lines, basic.get("target_count"))
                if basic.get("target_count") is None and parsed_targets:
                    basic["target_count"] = len(parsed_targets)
                    if basic.get("pass_rate") == 1.0:
                        basic["qualified_count"] = len(parsed_targets)
                        basic["unqualified_count"] = 0
                parsed_cache[filename] = (basic, parsed_targets, page_count, page_chars, sha256(pdf_path))
            except Exception as error:  # keep the rest of the batch auditable
                issues.append({
                    "severity": "error",
                    "code": "pdf_parse_exception",
                    "manifest_position": position,
                    "pdf_filename": filename,
                    "detail": str(error),
                })
                continue

        basic, parsed_targets, page_count, page_chars, digest = parsed_cache[filename]
        matched, match_method = match_list_record(
            manifest_row,
            basic,
            parsed_targets,
            list_by_id,
            list_by_org_year,
            emitter_industries,
            used_list_ids,
        )
        record_id = str(matched.get("verification_list_id")) if matched else str(manifest_row.get("verification_list_id") or "")
        if matched:
            used_list_ids.add(record_id)

        required_missing = [
            key
            for key in ("year", "institution_name", "unified_social_credit_code", "office_address")
            if not basic.get(key)
        ]
        source_blank_fields = [
            key
            for key in ("legal_representative",)
            if not basic.get(key)
        ]
        needs_ocr = basic.get("text_character_count", 0) < 120 or max(page_chars, default=0) < 80
        parsed_target_count = len(parsed_targets)
        summary_target_count = basic.get("summary_target_count")
        target_count_match = basic.get("target_count") == parsed_target_count
        parse_status = "parsed"
        if needs_ocr:
            parse_status = "needs_ocr"
        elif not matched:
            parse_status = "needs_list_match"
        elif required_missing or not target_count_match:
            parse_status = "needs_review"

        detail = {
            "verification_list_id": record_id,
            "year": int(matched.get("year")) if matched and str(matched.get("year", "")).isdigit() else basic.get("year"),
            "industry": str(matched.get("industry") or "") if matched else str(manifest_row.get("industry") or ""),
            "institution_name": basic.get("institution_name") or (matched or {}).get("institution_name") or "",
            "unified_social_credit_code": basic.get("unified_social_credit_code") or (matched or {}).get("unified_social_credit_code") or "",
            "legal_representative": basic.get("legal_representative") or "",
            "registered_capital_amount": basic.get("registered_capital_amount"),
            "registered_capital_unit": basic.get("registered_capital_unit") or "",
            "office_address": basic.get("office_address") or "",
            "contact_name": basic.get("contact_name") or "",
            "contact_details": basic.get("contact_details") or "",
            "bad_record": basic.get("bad_record") or "",
            "pass_rate": basic.get("pass_rate"),
            "qualified_count": basic.get("qualified_count"),
            "unqualified_count": basic.get("unqualified_count"),
            "target_count": basic.get("target_count"),
            "summary_target_count": summary_target_count,
            "parsed_target_count": parsed_target_count,
            "pdf_filename": filename,
            "pdf_url": manifest_row.get("pdf_url") or "",
            "pdf_sha256": digest,
            "pdf_pages": page_count,
            "page_text_characters": page_chars,
            "list_match_method": match_method,
            "required_fields_missing": required_missing,
            "source_blank_fields": source_blank_fields,
            "target_count_matches": target_count_match,
            "parse_status": parse_status,
            "parsed_at": captured_at,
        }
        details.append(detail)

        for target in parsed_targets:
            targets_out.append(
                {
                    "verification_list_id": record_id,
                    "year": detail["year"],
                    "industry": detail["industry"],
                    "institution_name": detail["institution_name"],
                    "institution_uscc": detail["unified_social_credit_code"],
                    **target,
                    "pdf_url": detail["pdf_url"],
                    "pdf_filename": filename,
                }
            )

        if parse_status != "parsed":
            issues.append({
                "severity": "error"
                if parse_status in {"needs_ocr", "needs_list_match"} or not target_count_match
                else "warning",
                "code": parse_status,
                "verification_list_id": record_id,
                "pdf_filename": filename,
                "required_fields_missing": required_missing,
                "source_blank_fields": source_blank_fields,
                "expected_targets": basic.get("target_count"),
                "parsed_targets": len(parsed_targets),
                "list_match_method": match_method,
            })

    expected = len(verification_list)
    matched_ids = {row["verification_list_id"] for row in details if row.get("verification_list_id")}
    missing_list_ids = sorted(set(list_by_id) - matched_ids)
    duplicate_detail_ids = sorted(key for key, count in Counter(row["verification_list_id"] for row in details).items() if key and count > 1)
    status_counts = Counter(row["parse_status"] for row in details)
    coverage = len(matched_ids) / expected if expected else 0
    error_count = sum(1 for issue in issues if issue["severity"] == "error")
    source_missing_pdf_ids = sorted({
        str(row.get("verification_list_id") or "")
        for row in manifest
        if not row.get("pdf_url") or row.get("pdf_url_source") == "missing_at_source"
    })
    unavailable_pdf_ids = sorted({
        str(issue.get("verification_list_id") or "")
        for issue in issues
        if issue.get("code") == "source_unavailable_pdf"
    })
    covered_or_source_missing = matched_ids | set(source_missing_pdf_ids) | set(unavailable_pdf_ids)
    effective_coverage = len(covered_or_source_missing) / expected if expected else 0
    remaining_missing_ids = sorted(set(list_by_id) - covered_or_source_missing)
    publish_ready = (
        effective_coverage >= args.min_coverage
        and not remaining_missing_ids
        and not duplicate_detail_ids
        and error_count == 0
        and (not source_missing_pdf_ids or args.allow_source_missing_pdf)
    )

    qa = {
        "dataset": "verification_pdf_details",
        "checked_at": captured_at,
        "manifest_records": len(manifest),
        "expected_list_records": expected,
        "parsed_detail_records": len(details),
        "matched_list_records": len(matched_ids),
        "parsed_target_records": len(targets_out),
        "coverage_rate": coverage,
        "effective_coverage_rate": effective_coverage,
        "source_missing_pdf_count": len(source_missing_pdf_ids),
        "source_missing_pdf_ids": source_missing_pdf_ids,
        "source_unavailable_pdf_count": len(unavailable_pdf_ids),
        "source_unavailable_pdf_ids": unavailable_pdf_ids,
        "remaining_missing_record_ids": remaining_missing_ids,
        "minimum_coverage_rate": args.min_coverage,
        "status_counts": dict(status_counts),
        "missing_list_record_count": len(missing_list_ids),
        "missing_list_record_ids": missing_list_ids,
        "duplicate_detail_ids": duplicate_detail_ids,
        "issue_count": len(issues),
        "error_count": error_count,
        "publish_ready": publish_ready,
        "issues": issues,
    }

    args.output_dir.mkdir(parents=True, exist_ok=True)
    candidate = {
        "generated_at": captured_at,
        "source_url": "https://www.cets.org.cn/xxgk/index.jhtml",
        "details": details,
        "targets": targets_out,
        "quality": qa,
    }
    candidate_path = args.output_dir / "cea-verification.candidate.json"
    candidate_path.write_text(json.dumps(candidate, ensure_ascii=False, indent=2), encoding="utf-8")
    (args.output_dir / "verification-pdf-quality.json").write_text(
        json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    detail_fields = [
        "verification_list_id", "year", "industry", "institution_name", "unified_social_credit_code",
        "legal_representative", "registered_capital_amount", "registered_capital_unit", "office_address",
        "contact_name", "contact_details", "bad_record", "pass_rate", "qualified_count", "unqualified_count",
        "target_count", "parsed_target_count", "pdf_filename", "pdf_url", "pdf_sha256", "pdf_pages",
        "list_match_method", "target_count_matches", "parse_status", "parsed_at",
    ]
    target_fields = [
        "verification_list_id", "year", "industry", "institution_name", "institution_uscc", "target_order",
        "target_entity_name", "target_uscc", "timeliness", "result", "pdf_url", "pdf_filename",
    ]
    write_csv(args.output_dir / "verification-details.csv", details, detail_fields)
    write_csv(args.output_dir / "verification-targets.csv", targets_out, target_fields)

    promoted = False
    if args.publish_json and (publish_ready or args.allow_partial):
        args.publish_json.parent.mkdir(parents=True, exist_ok=True)
        temp_path = args.publish_json.with_suffix(args.publish_json.suffix + ".tmp")
        temp_path.write_text(json.dumps(candidate, ensure_ascii=False), encoding="utf-8")
        temp_path.replace(args.publish_json)
        if args.publish_table_dir:
            args.publish_table_dir.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(args.output_dir / "verification-details.csv", args.publish_table_dir / "verification-details.csv")
            shutil.copyfile(args.output_dir / "verification-targets.csv", args.publish_table_dir / "verification-targets.csv")
            shutil.copyfile(
                args.output_dir / "verification-pdf-quality.json",
                args.publish_table_dir / "verification-pdf-quality.json",
            )
        promoted = True

    print(
        json.dumps(
            {
                "candidate": str(candidate_path),
                "publish_json": str(args.publish_json) if args.publish_json else "",
                "promoted": promoted,
                "publish_ready": publish_ready,
                "details": len(details),
                "targets": len(targets_out),
                "coverage_rate": coverage,
                "effective_coverage_rate": effective_coverage,
                "errors": error_count,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if publish_ready or args.allow_partial else 2


if __name__ == "__main__":
    raise SystemExit(main())
