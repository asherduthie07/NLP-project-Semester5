package review;
import java.util.List;

interface Named { String name(); }

class Entity implements Named {
    private int count;
    Entity(int initial) { count = initial; }
    /** Return a name. */
    public String name() { return "entity"; }
    public int find(int id) { return id; }
    public String find(String id) { return id; }
    public void invoke() { find(1); missing(); }
    class Nested<T> { T value; }
}
