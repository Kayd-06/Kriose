import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine import KrioseEngine  # noqa: E402


@pytest.fixture(scope="module")
def engine():
    kr = KrioseEngine()
    if not kr.ping():
        pytest.skip("FalkorDB is not running on localhost:6379")
    kr.reset_demo()
    return kr
