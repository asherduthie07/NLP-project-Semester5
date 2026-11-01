package review;
import review.Entity;

class Derived extends Entity {
    Derived() { super(1); }
    public int total() { int local = 1; return local; }
}

record Entry(String key, int value) {}
enum Mode { READ, WRITE }
