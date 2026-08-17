import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from github_actions_cets import PUBLISH_PATHS, git_blob_sha, publish


class MatchingClient:
    def __init__(self, root: Path):
        self.root = root
        self.paths = []

    def request(self, method, path, payload=None, expected=(200,)):
        self.paths.append((method, path))
        relative = path.removeprefix("contents/").split("?", 1)[0]
        content = (self.root / relative).read_bytes()
        return {"type": "file", "sha": git_blob_sha(content)}


class GitHubActionsCetsTests(unittest.TestCase):
    def test_git_blob_sha_matches_git_for_empty_content(self):
        self.assertEqual(git_blob_sha(b""), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")

    def test_publish_skips_commit_when_all_remote_blobs_match(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative in PUBLISH_PATHS:
                destination = root / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text(relative, encoding="utf-8")
            output = root / "github-output.txt"
            client = MatchingClient(root)
            with patch.dict(os.environ, {"GITHUB_OUTPUT": str(output)}):
                publish(root, client)
            self.assertEqual(output.read_text(encoding="utf-8"), "changed=false\n")
            self.assertEqual(len(client.paths), len(PUBLISH_PATHS))


if __name__ == "__main__":
    unittest.main()
