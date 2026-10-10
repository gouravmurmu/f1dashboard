import pytest

from backend import demo


@pytest.fixture(scope="session")
def race():
    return demo.generate_race(2024, 1)


@pytest.fixture(scope="session")
def season():
    return demo.demo_history(2024)
