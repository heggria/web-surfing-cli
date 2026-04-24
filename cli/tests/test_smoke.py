"""M0 smoke test: package imports and CLI runs."""

import json
import subprocess
import sys

from wsc import __version__
from wsc.cli import main


def test_version_constant():
    assert __version__ == "0.1.0"


def test_help_returns_zero():
    # Run via subprocess so argparse's SystemExit doesn't bubble into pytest.
    result = subprocess.run(
        [sys.executable, "-m", "wsc.cli", "--help"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    assert "wsc" in result.stdout


def test_no_command_prints_help_and_returns_zero():
    rc = main([])
    assert rc == 0


def test_unimplemented_subcommand_returns_64():
    rc = main(["init"])
    assert rc == 64
