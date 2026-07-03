#include <mapbox/polylabel.hpp>

#include <cassert>
#include <cctype>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>

using namespace mapbox;

class JsonFixtureParser {
public:
    explicit JsonFixtureParser(std::string input_) : input(std::move(input_)) {}

    geometry::polygon<double> parsePolygon() {
        geometry::polygon<double> polygon;
        consume('[');
        skipWhitespace();
        while (!tryConsume(']')) {
            polygon.push_back(parseRing());
            skipWhitespace();
            tryConsume(',');
        }
        return polygon;
    }

private:
    geometry::linear_ring<double> parseRing() {
        geometry::linear_ring<double> ring;
        consume('[');
        skipWhitespace();
        while (!tryConsume(']')) {
            consume('[');
            const double x = parseNumber();
            consume(',');
            const double y = parseNumber();
            consume(']');
            ring.push_back({x, y});
            skipWhitespace();
            tryConsume(',');
        }
        return ring;
    }

    double parseNumber() {
        skipWhitespace();
        const char* begin = input.c_str() + pos;
        char* end = nullptr;
        const double value = std::strtod(begin, &end);
        if (end == begin) throw std::runtime_error("expected number");
        pos += static_cast<std::size_t>(end - begin);
        skipWhitespace();
        return value;
    }

    void consume(char expected) {
        skipWhitespace();
        if (pos >= input.size() || input[pos] != expected) {
            throw std::runtime_error(std::string("expected '") + expected + "'");
        }
        ++pos;
        skipWhitespace();
    }

    bool tryConsume(char expected) {
        skipWhitespace();
        if (pos < input.size() && input[pos] == expected) {
            ++pos;
            skipWhitespace();
            return true;
        }
        return false;
    }

    void skipWhitespace() {
        while (pos < input.size() && std::isspace(static_cast<unsigned char>(input[pos]))) {
            ++pos;
        }
    }

    std::string input;
    std::size_t pos = 0;
};

geometry::polygon<double> fixture(const std::string& path) {
    std::ifstream file(path.c_str());
    std::stringstream buffer;
    buffer << file.rdbuf();
    return JsonFixtureParser(buffer.str()).parsePolygon();
}

int main() {
    const auto water1 = fixture("./test/fixtures/water1.json");
    const auto water2 = fixture("./test/fixtures/water2.json");

    assert(polylabel(water1, 1.0) == geometry::point<double>(3865.85009765625, 2124.87841796875));
    assert(polylabel(water1, 50.0) == geometry::point<double>(3854.296875, 2123.828125));
    assert(polylabel(water2) == geometry::point<double>(3263.5, 3263.5));

    assert(polylabel(geometry::polygon<double>({{{0, 0}, {1, 0}, {2, 0}, {0, 0}}})) ==
           geometry::point<double>(0, 0));
    assert(polylabel(geometry::polygon<double>({{{0, 0}, {1, 0}, {1, 1}, {1, 0}, {0, 0}}})) ==
           geometry::point<double>(0, 0));
}
