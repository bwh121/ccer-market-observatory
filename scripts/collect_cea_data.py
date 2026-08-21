#!/usr/bin/env python3
"""Collect and validate national CEA market data from the official CNEEEX site."""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable


BASE_URL = "https://shyx.cneeex.com/"
PAGE_URL = BASE_URL + "qdata.html"
SUBSTAT_URL = BASE_URL + "gateway/common/querySubStat"
MARKET_URL = BASE_URL + "gateway/common/queryMarketByDate"
HOLIDAYS_URL = BASE_URL + "assets/json/holidays.json"
START_DATE = date(2021, 7, 16)
METHOD_NAMES = {"10": "挂牌协议交易", "20": "大宗协议交易", "21": "单向竞价交易"}
SUBJECT_LABELS = {"COMCEA": "综合价格行情"}
PRINT_LOCK = threading.Lock()


@dataclass(frozen=True)
class Settings:
    output_dir: Path
    end_date: date
    workers: int
    timeout: int
    retries: int
    refresh: bool


def parse_args() -> Settings:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--end-date", default=date.today().isoformat())
    parser.add_argument("--workers", type=int, default=5)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--retries", type=int, default=5)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    return Settings(
        output_dir=args.output_dir.resolve(),
        end_date=date.fromisoformat(args.end_date),
        workers=max(1, min(args.workers, 10)),
        timeout=max(5, args.timeout),
        retries=max(1, args.retries),
        refresh=args.refresh,
    )


def log(message: str) -> None:
    with PRINT_LOCK:
        print(message, flush=True)


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def request_json(url: str, timeout: int, retries: int, payload: dict[str, Any] | None = None) -> Any:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "Referer": PAGE_URL,
        "User-Agent": "CEA-data-collector/1.0 (public market data; low concurrency)",
    }
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method="GET" if body is None else "POST")
            with urllib.request.urlopen(req, timeout=timeout) as response:
                raw = response.read()
            return json.loads(raw.decode("utf-8-sig"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt == retries:
                break
            time.sleep(min(10, 0.6 * (2 ** (attempt - 1))) + random.random() * 0.25)
    raise RuntimeError(f"request failed after {retries} attempts: {url}: {last_error}")


def cached_request(path: Path, settings: Settings, url: str, payload: dict[str, Any] | None = None) -> Any:
    if path.exists() and not settings.refresh:
        return load_json(path)
    value = request_json(url, settings.timeout, settings.retries, payload)
    atomic_json(path, value)
    return value


def date_range(start: date, end: date) -> Iterable[date]:
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def as_number(value: Any) -> int | float | None:
    if value is None or value == "":
        return None
    text = str(value).strip().replace(",", "")
    if text.endswith("%"):
        text = text[:-1]
        scale = Decimal("0.01")
    else:
        scale = Decimal("1")
    try:
        number = Decimal(text) * scale
    except InvalidOperation:
        return None
    if number == number.to_integral_value():
        return int(number)
    return float(number)


def iso_date(compact: str) -> str:
    return f"{compact[:4]}-{compact[4:6]}-{compact[6:8]}"


def subject_label(code: str, name: str | None = None) -> str:
    if code in SUBJECT_LABELS:
        return SUBJECT_LABELS[code]
    return code if not name else f"{code}（{name}）"


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def get_holidays(settings: Settings) -> set[str]:
    cache = settings.output_dir / "raw" / "holidays.json"
    holidays = request_json(HOLIDAYS_URL, settings.timeout, settings.retries)
    atomic_json(cache, holidays)
    if not isinstance(holidays, list):
        raise RuntimeError("official holidays.json did not return a list")
    return {str(value) for value in holidays}


def collect_substats(settings: Settings, candidates: list[date]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    raw_dir = settings.output_dir / "raw" / "substat"
    results: dict[str, Any] = {}
    failures: list[dict[str, Any]] = []

    def job(day: date) -> tuple[str, Any]:
        compact = day.strftime("%Y%m%d")
        path = raw_dir / f"{compact}.json"
        if path.exists() and not settings.refresh:
            cached = load_json(path)
            if isinstance(cached, dict) and cached.get("success") and cached.get("data"):
                return compact, cached
        response = request_json(
            SUBSTAT_URL,
            settings.timeout,
            settings.retries,
            {"tradeDate": compact},
        )
        atomic_json(path, response)
        return compact, response

    log(f"[1/4] checking {len(candidates)} expected trading dates")
    with ThreadPoolExecutor(max_workers=settings.workers) as pool:
        futures = {pool.submit(job, day): day for day in candidates}
        for index, future in enumerate(as_completed(futures), 1):
            day = futures[future]
            try:
                compact, response = future.result()
                results[compact] = response
            except Exception as exc:  # noqa: BLE001
                failures.append({"endpoint": "querySubStat", "trade_date": day.isoformat(), "error": str(exc)})
            if index % 100 == 0 or index == len(futures):
                log(f"  substat {index}/{len(futures)}")
    return results, failures


def collect_markets(
    settings: Settings, pairs: list[tuple[str, str]]
) -> tuple[dict[tuple[str, str], Any], list[dict[str, Any]]]:
    raw_dir = settings.output_dir / "raw" / "market"
    results: dict[tuple[str, str], Any] = {}
    failures: list[dict[str, Any]] = []

    def job(pair: tuple[str, str]) -> tuple[tuple[str, str], Any]:
        compact, code = pair
        path = raw_dir / f"{compact}_{code}.json"
        response = cached_request(
            path, settings, MARKET_URL, {"tradeDate": compact, "goodsCode": code}
        )
        return pair, response

    log(f"[2/4] collecting {len(pairs)} date-subject price records")
    with ThreadPoolExecutor(max_workers=settings.workers) as pool:
        futures = {pool.submit(job, pair): pair for pair in pairs}
        for index, future in enumerate(as_completed(futures), 1):
            compact, code = futures[future]
            try:
                pair, response = future.result()
                results[pair] = response
            except Exception as exc:  # noqa: BLE001
                failures.append(
                    {"endpoint": "queryMarketByDate", "trade_date": iso_date(compact), "subject_code": code, "error": str(exc)}
                )
            if index % 250 == 0 or index == len(futures):
                log(f"  market {index}/{len(futures)}")
    return results, failures


def normalize_trade(substats: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for compact in sorted(substats):
        response = substats[compact]
        if not isinstance(response, dict) or not response.get("success"):
            continue
        for item in response.get("data") or []:
            code = str(item.get("subjectCode") or "")
            method = str(item.get("tradeMethod") or "")
            source_name = item.get("subjectName")
            rows.append(
                {
                    "trade_date": iso_date(str(item.get("tradeDate") or compact)),
                    "subject_code": code,
                    "subject_label": subject_label(code),
                    "subject_name_source": source_name,
                    "trade_method_code": method,
                    "trade_method_name": METHOD_NAMES.get(method, f"未知方式{method}"),
                    "daily_volume_t": as_number(item.get("tradeVolume")),
                    "daily_amount_cny": as_number(item.get("tradeAmount")),
                    "ytd_volume_t": as_number(item.get("yearVolume")),
                    "ytd_amount_cny": as_number(item.get("yearAmount")),
                    "historical_volume_t": as_number(item.get("totalVolume")),
                    "historical_amount_cny": as_number(item.get("totalAmount")),
                    "source_url": PAGE_URL,
                }
            )
    return rows


def normalize_price(markets: dict[tuple[str, str], Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for compact, code in sorted(markets):
        response = markets[(compact, code)]
        if not isinstance(response, dict) or not response.get("success"):
            continue
        data = response.get("data") or []
        if not data:
            continue
        item = data[0]
        rows.append(
            {
                "trade_date": iso_date(str(item.get("quotPoin") or compact)),
                "subject_code": str(item.get("subjCode") or code),
                "subject_label": subject_label(code),
                "subject_name_source": item.get("subjName"),
                "close_price_cny_per_t": as_number(item.get("closPric")),
                "change_rate": as_number(item.get("chanRate")),
                "previous_close_cny_per_t": as_number(item.get("lastClosPric")),
                "open_price_cny_per_t": as_number(item.get("openPric")),
                "high_price_cny_per_t": as_number(item.get("highPric")),
                "low_price_cny_per_t": as_number(item.get("lowPric")),
                "listed_deal_volume_t": as_number(item.get("dealQty")),
                "listed_deal_amount_cny": as_number(item.get("dealAmt")),
                "price_change_cny_per_t": as_number(item.get("chanPric")),
                "source_url": PAGE_URL,
            }
        )
    return rows


def build_wide(price_rows: list[dict[str, Any]], trade_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    trade_index: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in trade_rows:
        trade_index.setdefault((row["trade_date"], row["subject_code"]), []).append(row)
    price_index = {(row["trade_date"], row["subject_code"]): row for row in price_rows}
    price_fields = [
        "subject_name_source",
        "close_price_cny_per_t",
        "change_rate",
        "previous_close_cny_per_t",
        "open_price_cny_per_t",
        "high_price_cny_per_t",
        "low_price_cny_per_t",
        "listed_deal_volume_t",
        "listed_deal_amount_cny",
        "price_change_cny_per_t",
    ]
    result: list[dict[str, Any]] = []
    for key in sorted(set(price_index) | set(trade_index)):
        price = price_index.get(key)
        if price is None:
            price = {
                "trade_date": key[0],
                "subject_code": key[1],
                "subject_label": subject_label(key[1]),
                "source_url": PAGE_URL,
                **{field: None for field in price_fields},
            }
        method_rows = trade_index.get(key, [])
        by_method = {row["trade_method_code"]: row for row in method_rows}
        row = dict(price)
        for method, prefix in (("10", "listing"), ("20", "block"), ("21", "auction")):
            source = by_method.get(method)
            row[f"{prefix}_volume_t"] = None if source is None else source["daily_volume_t"]
            row[f"{prefix}_amount_cny"] = None if source is None else source["daily_amount_cny"]
        for field, target in (
            ("daily_volume_t", "subtotal_volume_t"),
            ("daily_amount_cny", "subtotal_amount_cny"),
            ("ytd_volume_t", "ytd_volume_t"),
            ("ytd_amount_cny", "ytd_amount_cny"),
            ("historical_volume_t", "historical_volume_t"),
            ("historical_amount_cny", "historical_amount_cny"),
        ):
            values = [entry[field] for entry in method_rows if entry[field] is not None]
            if not values:
                row[target] = None
            elif "amount" in field:
                row[target] = round(sum(values), 2)
            else:
                row[target] = sum(values)
        result.append(row)
    return result


def validate(
    expected_dates: list[date], substats: dict[str, Any], price_rows: list[dict[str, Any]], trade_rows: list[dict[str, Any]], failures: list[dict[str, Any]]
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    checks: list[dict[str, Any]] = []

    def add(check: str, severity: str, count: int, detail: str) -> None:
        checks.append({"check": check, "severity": severity, "issue_count": count, "detail": detail})

    expected_strings = [value.isoformat() for value in expected_dates]
    data_dates = sorted({row["trade_date"] for row in trade_rows})
    missing_dates = sorted(set(expected_strings) - set(data_dates))
    add("expected_trading_dates_without_data", "warning", len(missing_dates), ", ".join(missing_dates[:30]))

    trade_keys = [(r["trade_date"], r["subject_code"], r["trade_method_code"]) for r in trade_rows]
    price_keys = [(r["trade_date"], r["subject_code"]) for r in price_rows]
    add("duplicate_trade_keys", "error", len(trade_keys) - len(set(trade_keys)), "key: date + subject + method")
    add("duplicate_price_keys", "error", len(price_keys) - len(set(price_keys)), "key: date + subject")

    expected_pairs = {
        (iso_date(compact), str(item.get("subjectCode")))
        for compact, response in substats.items()
        if isinstance(response, dict) and response.get("success")
        for item in (response.get("data") or [])
    }
    actual_pairs = set(price_keys)
    missing_pairs = sorted(expected_pairs - actual_pairs)
    add("official_price_response_missing", "warning", len(missing_pairs), str(missing_pairs[:20]))

    unknown_methods = sorted({row["trade_method_code"] for row in trade_rows} - set(METHOD_NAMES))
    add("unknown_trade_methods", "warning", len(unknown_methods), ", ".join(unknown_methods))

    reconciliation_issues = []
    reconciliation_groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in trade_rows:
        reconciliation_groups.setdefault((row["trade_date"], row["trade_method_code"]), []).append(row)
    reconciliation_fields = [
        "daily_volume_t", "daily_amount_cny", "ytd_volume_t", "ytd_amount_cny",
        "historical_volume_t", "historical_amount_cny",
    ]
    for key, rows in reconciliation_groups.items():
        composite = next((row for row in rows if row["subject_code"] == "COMCEA"), None)
        if composite is None:
            continue
        components = [row for row in rows if row["subject_code"] != "COMCEA"]
        for field in reconciliation_fields:
            actual = composite[field] or 0
            expected = sum((row[field] or 0) for row in components)
            if abs(actual - expected) > 0.011:
                reconciliation_issues.append((*key, field, actual, expected))
    add("comcea_equals_subject_sum", "error", len(reconciliation_issues), str(reconciliation_issues[:20]))

    price_range_issues = []
    composite_price_range_issues = []
    change_rate_issues = []
    for row in price_rows:
        qty = row["listed_deal_volume_t"] or 0
        high, low, close = row["high_price_cny_per_t"], row["low_price_cny_per_t"], row["close_price_cny_per_t"]
        if qty > 0 and None not in (high, low, close) and not (high >= close >= low):
            target = composite_price_range_issues if row["subject_code"] == "COMCEA" else price_range_issues
            target.append((row["trade_date"], row["subject_code"]))
        previous = row["previous_close_cny_per_t"]
        stated = row["change_rate"]
        if previous not in (None, 0) and close is not None and stated is not None:
            calculated = (close - previous) / previous
            if abs(calculated - stated) > 0.00011:
                change_rate_issues.append((row["trade_date"], row["subject_code"], calculated, stated))
    add("price_outside_daily_range", "error", len(price_range_issues), str(price_range_issues[:20]))
    add(
        "composite_price_outside_reported_range",
        "warning",
        len(composite_price_range_issues),
        str(composite_price_range_issues[:20]),
    )
    add("change_rate_mismatch", "warning", len(change_rate_issues), str(change_rate_issues[:20]))

    cumulative_issues = []
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in trade_rows:
        groups.setdefault((row["subject_code"], row["trade_method_code"]), []).append(row)
    for key, rows in groups.items():
        rows.sort(key=lambda value: value["trade_date"])
        previous_total = None
        previous_ytd_by_year: dict[str, Any] = {}
        for row in rows:
            total = row["historical_volume_t"]
            year = row["trade_date"][:4]
            ytd = row["ytd_volume_t"]
            if previous_total is not None and total is not None and total < previous_total:
                cumulative_issues.append((*key, row["trade_date"], "historical_volume"))
            previous_ytd = previous_ytd_by_year.get(year)
            if previous_ytd is not None and ytd is not None and ytd < previous_ytd:
                cumulative_issues.append((*key, row["trade_date"], "ytd_volume"))
            if total is not None:
                previous_total = total
            if ytd is not None:
                previous_ytd_by_year[year] = ytd
    add("cumulative_volume_decrease", "warning", len(cumulative_issues), str(cumulative_issues[:20]))

    add("request_failures", "error", len(failures), str(failures[:20]))
    error_count = sum(item["issue_count"] for item in checks if item["severity"] == "error")
    warning_count = sum(item["issue_count"] for item in checks if item["severity"] == "warning")
    status = "FAIL" if error_count else ("WARN" if warning_count else "PASS")
    report = {
        "status": status,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "expected_trading_dates": len(expected_dates),
            "dates_with_data": len(data_dates),
            "first_data_date": data_dates[0] if data_dates else None,
            "last_data_date": data_dates[-1] if data_dates else None,
            "price_rows": len(price_rows),
            "trade_rows": len(trade_rows),
            "error_issues": error_count,
            "warning_issues": warning_count,
        },
        "missing_expected_dates": missing_dates,
        "request_failures": failures,
        "checks": checks,
    }
    return report, checks


def main() -> int:
    settings = parse_args()
    if settings.end_date < START_DATE:
        raise SystemExit("end date is before market opening date")
    settings.output_dir.mkdir(parents=True, exist_ok=True)
    holidays = get_holidays(settings)
    expected_dates = [
        day for day in date_range(START_DATE, settings.end_date)
        if day.weekday() < 5 and day.isoformat() not in holidays
    ]
    substats, failures = collect_substats(settings, expected_dates)
    pairs = sorted({
        (compact, str(item.get("subjectCode")))
        for compact, response in substats.items()
        if isinstance(response, dict) and response.get("success")
        for item in (response.get("data") or [])
        if item.get("subjectCode")
    })
    markets, market_failures = collect_markets(settings, pairs)
    failures.extend(market_failures)
    log("[3/4] normalizing tables")
    trade_rows = normalize_trade(substats)
    price_rows = normalize_price(markets)
    wide_rows = build_wide(price_rows, trade_rows)
    report, checks = validate(expected_dates, substats, price_rows, trade_rows, failures)

    data_dir = settings.output_dir / "data"
    atomic_json(data_dir / "price_daily.json", price_rows)
    atomic_json(data_dir / "trade_method_daily.json", trade_rows)
    atomic_json(data_dir / "daily_wide.json", wide_rows)
    calendar_rows = [
        {
            "date": day.isoformat(),
            "weekday": day.isoweekday(),
            "is_weekend": day.weekday() >= 5,
            "is_official_holiday": day.isoformat() in holidays,
            "expected_open": day in expected_dates,
            "has_data": day.isoformat() in {row["trade_date"] for row in trade_rows},
        }
        for day in date_range(START_DATE, settings.end_date)
    ]
    atomic_json(data_dir / "calendar_status.json", calendar_rows)
    atomic_json(data_dir / "quality_report.json", report)
    atomic_json(data_dir / "field_dictionary.json", FIELD_DICTIONARY)

    price_fields = list(price_rows[0].keys()) if price_rows else []
    trade_fields = list(trade_rows[0].keys()) if trade_rows else []
    wide_fields = list(wide_rows[0].keys()) if wide_rows else []
    write_csv(data_dir / "price_daily.csv", price_rows, price_fields)
    write_csv(data_dir / "trade_method_daily.csv", trade_rows, trade_fields)
    write_csv(data_dir / "daily_wide.csv", wide_rows, wide_fields)
    write_csv(data_dir / "calendar_status.csv", calendar_rows, list(calendar_rows[0].keys()))
    write_csv(data_dir / "quality_checks.csv", checks, ["check", "severity", "issue_count", "detail"])

    manifest = {
        "source_page": PAGE_URL,
        "source_endpoints": [SUBSTAT_URL, MARKET_URL, HOLIDAYS_URL],
        "market_open_date": START_DATE.isoformat(),
        "requested_end_date": settings.end_date.isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "quality_status": report["status"],
        "summary": report["summary"],
        "subject_codes": sorted({row["subject_code"] for row in trade_rows}),
        "trade_methods": METHOD_NAMES,
        "files": sorted(str(path.relative_to(settings.output_dir)).replace("\\", "/") for path in data_dir.iterdir()),
    }
    atomic_json(settings.output_dir / "run_manifest.json", manifest)
    log(f"[4/4] complete: {report['status']} | {len(price_rows)} price rows | {len(trade_rows)} trade rows")
    return 0 if report["status"] != "FAIL" else 2


FIELD_DICTIONARY = [
    {"table": "price_daily", "field": "trade_date", "type": "date", "description": "交易日"},
    {"table": "price_daily", "field": "subject_code", "type": "text", "description": "标的代码；COMCEA为综合价格行情"},
    {"table": "price_daily", "field": "close_price_cny_per_t", "type": "number", "description": "收盘价，元/吨"},
    {"table": "price_daily", "field": "change_rate", "type": "decimal", "description": "相对昨收价涨跌幅；0.0113表示1.13%"},
    {"table": "price_daily", "field": "previous_close_cny_per_t", "type": "number", "description": "昨收价，元/吨"},
    {"table": "price_daily", "field": "open_price_cny_per_t", "type": "number", "description": "开盘价，元/吨"},
    {"table": "price_daily", "field": "high_price_cny_per_t", "type": "number", "description": "最高价，元/吨；无挂牌成交时API常返回0"},
    {"table": "price_daily", "field": "low_price_cny_per_t", "type": "number", "description": "最低价，元/吨；无挂牌成交时API常返回0"},
    {"table": "trade_method_daily", "field": "trade_method_code", "type": "text", "description": "10挂牌协议、20大宗协议、21单向竞价"},
    {"table": "trade_method_daily", "field": "daily_volume_t", "type": "integer", "description": "当日成交量，吨"},
    {"table": "trade_method_daily", "field": "daily_amount_cny", "type": "number", "description": "当日成交额，元"},
    {"table": "trade_method_daily", "field": "ytd_volume_t", "type": "integer", "description": "当年累计成交量，吨"},
    {"table": "trade_method_daily", "field": "ytd_amount_cny", "type": "number", "description": "当年累计成交额，元"},
    {"table": "trade_method_daily", "field": "historical_volume_t", "type": "integer", "description": "历史累计成交量，吨"},
    {"table": "trade_method_daily", "field": "historical_amount_cny", "type": "number", "description": "历史累计成交额，元"},
    {"table": "daily_wide", "field": "subtotal_volume_t", "type": "integer", "description": "三种交易方式当日成交量合计"},
    {"table": "daily_wide", "field": "subtotal_amount_cny", "type": "number", "description": "三种交易方式当日成交额合计"},
]


if __name__ == "__main__":
    raise SystemExit(main())
