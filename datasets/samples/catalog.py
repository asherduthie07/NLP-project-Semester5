"""Synthetic catalog helpers for the CodeAtlas Phase I corpus."""
from decimal import Decimal

# Prices use decimal arithmetic; café and 日本語 exercise Unicode comments.
class Catalog:
    """Keep named prices in memory."""

    def __init__(self):
        """Initialize an empty catalog."""
        self.prices = {}

    def add_item(self, name: str, price: str):
        """Store a price and return a formatter closure."""
        self.prices[name] = Decimal(price)

        def format_price():
            """Render the newly stored price."""
            return f"{name}: {self.prices[name]}"

        return format_price
