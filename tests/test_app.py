from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

ROOT = Path(__file__).resolve().parents[1]
PAGES = ["app.py"] + sorted(str(p.relative_to(ROOT)) for p in (ROOT / "pages").glob("*.py"))


@pytest.mark.parametrize("page", PAGES)
def test_page_renders_on_demo_data(page):
    at = AppTest.from_file(str(ROOT / page), default_timeout=300)
    at.session_state["source"] = "demo"
    at.run()
    assert not at.exception, at.exception
