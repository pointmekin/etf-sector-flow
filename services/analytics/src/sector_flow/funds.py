from dataclasses import dataclass


@dataclass(frozen=True)
class Fund:
    ticker: str
    name: str
    sector: str
    inception_date: str

    @property
    def source_url(self) -> str:
        return (
            "https://www.ssga.com/library-content/products/fund-data/etfs/us/"
            f"navhist-us-en-{self.ticker.lower()}.xlsx"
        )


FUNDS = (
    Fund(
        "XLC",
        "Communication Services Select Sector SPDR ETF",
        "Communication Services",
        "2018-06-18",
    ),
    Fund(
        "XLY",
        "Consumer Discretionary Select Sector SPDR ETF",
        "Consumer Discretionary",
        "1998-12-16",
    ),
    Fund("XLP", "Consumer Staples Select Sector SPDR ETF", "Consumer Staples", "1998-12-16"),
    Fund("XLE", "Energy Select Sector SPDR ETF", "Energy", "1998-12-16"),
    Fund("XLF", "Financial Select Sector SPDR ETF", "Financials", "1998-12-16"),
    Fund("XLV", "Health Care Select Sector SPDR ETF", "Health Care", "1998-12-16"),
    Fund("XLI", "Industrial Select Sector SPDR ETF", "Industrials", "1998-12-16"),
    Fund("XLB", "Materials Select Sector SPDR ETF", "Materials", "1998-12-16"),
    Fund("XLRE", "Real Estate Select Sector SPDR ETF", "Real Estate", "2015-10-07"),
    Fund("XLK", "Technology Select Sector SPDR ETF", "Technology", "1998-12-16"),
    Fund("XLU", "Utilities Select Sector SPDR ETF", "Utilities", "1998-12-16"),
)

FUND_BY_TICKER = {fund.ticker: fund for fund in FUNDS}
PRICE_TICKERS = tuple(fund.ticker for fund in FUNDS) + ("SPY",)
