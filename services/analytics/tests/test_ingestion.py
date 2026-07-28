import json
from pathlib import Path

from openpyxl import Workbook

from sector_flow.ingestion import parse_nav_history


def test_parse_representative_state_street_workbook(tmp_path: Path) -> None:
    fixture = json.loads((Path(__file__).parent / "fixtures" / "ssga_nav_history.json").read_text())
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["Fund Name:", fixture["fund_name"]])
    sheet.append(["Ticker Symbol:", fixture["ticker"]])
    sheet.append([])
    sheet.append(fixture["headers"])
    for row in fixture["rows"]:
        sheet.append(row)
    sheet.append([])
    sheet.append(["Before investing, read the prospectus carefully."])
    path = tmp_path / "nav-history.xlsx"
    workbook.save(path)

    rows = parse_nav_history(path, "https://example.test/nav.xlsx")

    assert [row.date.isoformat() for row in rows] == ["2025-01-02", "2025-01-03"]
    assert rows[-1].nav == 101
    assert rows[-1].shares_outstanding == 1_000_000
    assert rows[-1].quality_status == "ok"


def test_parser_rejects_unexpected_columns(tmp_path: Path) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["Fund Name:", "Synthetic"])
    sheet.append(["Ticker Symbol:", "XLK"])
    sheet.append([])
    sheet.append(["Date", "NAV", "Wrong", "Total Net Assets"])
    path = tmp_path / "invalid.xlsx"
    workbook.save(path)

    try:
        parse_nav_history(path, "https://example.test/nav.xlsx")
    except ValueError as error:
        assert "Unexpected State Street columns" in str(error)
    else:
        raise AssertionError("Expected invalid columns to be rejected")
