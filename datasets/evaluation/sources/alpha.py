"""Synthetic evaluation fixture; MIT. Never execute."""
import beta as peer
from missing_library import absent as unknown

class Base:
    """Base documentation."""
    shared = 1

    def __init__(self, value: int):
        self.value = value

    class Nested:
        pass

    @staticmethod
    async def compute(item: int) -> int:
        """Compute a value."""
        local_value = item
        def helper():
            return local_value
        return helper()

def duplicate():
    return 1

def caller():
    return duplicate()
