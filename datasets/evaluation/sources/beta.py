import alpha
from .missing import unknown

class Derived(alpha.Base):
    @classmethod
    def create(cls):
        return cls()

def duplicate():
    return 2

def outer():
    def duplicate():
        return 3
    return duplicate()
