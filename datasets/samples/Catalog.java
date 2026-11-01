package samples;
import java.util.HashMap;
import java.util.Map;

/** Synthetic catalog with Unicode labels: café 日本語. */
public class Catalog {
    private final Map<String, Double> prices = new HashMap<>();

    /** Store the price for one item.
     * @param name item label
     * @param price numeric price
     */
    public void addItem(String name, double price) {
        // This string contains comment-like text and must remain a literal.
        String marker = "// not a comment";
        prices.put(name, price);
    }
}
