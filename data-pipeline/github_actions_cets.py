"""GitHub REST helpers for the CETS verification workflow.

This module deliberately uses only the Python standard library so the
self-hosted collector can publish validated data without downloading a
Marketplace action during job setup.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


PUBLISH_PATHS = (
    "public/data/cea-dashboard.json",
    "public/data/cea-participants.json",
    "public/data/cea-verification.json",
    "public/data/exports/verification-details.csv",
    "public/data/exports/verification-pdf-quality.json",
    "public/data/exports/verification-targets.csv",
)


class GitHubApiError(RuntimeError):
    def __init__(self, status: int, body: str):
        super().__init__(f"GitHub API returned HTTP {status}: {body[:500]}")
        self.status = status


class GitHubClient:
    def __init__(self, repository: str, token: str):
        self.base = f"https://api.github.com/repos/{repository}"
        self.token = token

    def request(self, method: str, path: str, payload=None, expected=(200,)):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base}/{path.lstrip('/')}",
            data=data,
            method=method,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                "User-Agent": "ccer-cets-verification-workflow",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        for attempt in range(1, 4):
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    body = response.read()
                    if response.status not in expected:
                        raise GitHubApiError(response.status, body.decode("utf-8", "replace"))
                    return json.loads(body) if body else None
            except urllib.error.HTTPError as error:
                body = error.read().decode("utf-8", "replace")
                if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                    raise GitHubApiError(error.code, body) from error
            except urllib.error.URLError:
                if attempt == 3:
                    raise
            time.sleep(attempt * 5)
        raise AssertionError("unreachable")


def git_blob_sha(content: bytes) -> str:
    header = f"blob {len(content)}\0".encode("ascii")
    return hashlib.sha1(header + content).hexdigest()


def write_output(name: str, value: str) -> None:
    output_path = os.environ.get("GITHUB_OUTPUT")
    if output_path:
        with open(output_path, "a", encoding="utf-8") as output:
            output.write(f"{name}={value}\n")


def publish(root: Path, client: GitHubClient) -> None:
    changed = []
    for relative_path in PUBLISH_PATHS:
        content = (root / relative_path).read_bytes()
        remote = client.request(
            "GET",
            f"contents/{urllib.parse.quote(relative_path)}?ref=main",
        )
        if remote.get("type") != "file":
            raise RuntimeError(f"Expected a file at {relative_path}")
        if remote["sha"] != git_blob_sha(content):
            changed.append((relative_path, content))

    if not changed:
        write_output("changed", "false")
        return

    blobs = []
    for relative_path, content in changed:
        blob = client.request(
            "POST",
            "git/blobs",
            {"content": base64.b64encode(content).decode("ascii"), "encoding": "base64"},
            expected=(201,),
        )
        blobs.append({"path": relative_path, "mode": "100644", "type": "blob", "sha": blob["sha"]})

    for attempt in range(1, 4):
        branch_ref = client.request("GET", "git/ref/heads/main")
        parent_sha = branch_ref["object"]["sha"]
        parent = client.request("GET", f"git/commits/{parent_sha}")
        tree = client.request(
            "POST",
            "git/trees",
            {"base_tree": parent["tree"]["sha"], "tree": blobs},
            expected=(201,),
        )
        commit = client.request(
            "POST",
            "git/commits",
            {
                "message": "data: refresh CETS verification PDFs",
                "tree": tree["sha"],
                "parents": [parent_sha],
            },
            expected=(201,),
        )
        try:
            client.request(
                "PATCH",
                "git/refs/heads/main",
                {"sha": commit["sha"], "force": False},
                expected=(200,),
            )
            client.request(
                "POST",
                "actions/workflows/deploy-pages.yml/dispatches",
                {"ref": "main"},
                expected=(204,),
            )
            write_output("changed", "true")
            print(f"Published {len(changed)} validated data files in {commit['sha']}.")
            return
        except GitHubApiError as error:
            if error.status not in (409, 422) or attempt == 3:
                raise
            print(f"main advanced during publish; retrying ({attempt + 1}/3).")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("publish",))
    parser.add_argument("--root", type=Path, default=Path.cwd())
    args = parser.parse_args()
    token = os.environ.get("GITHUB_TOKEN")
    repository = os.environ.get("GITHUB_REPOSITORY")
    if not token or not repository:
        raise RuntimeError("GITHUB_TOKEN and GITHUB_REPOSITORY are required")
    client = GitHubClient(repository, token)
    if args.command == "publish":
        publish(args.root.resolve(), client)


if __name__ == "__main__":
    main()
