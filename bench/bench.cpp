#include <mapbox/polylabel.hpp>

#include <chrono>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

using namespace mapbox;

volatile double sink = 0;

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

geometry::linear_ring<double> regularRing(std::size_t n, double cx, double cy, double radius, bool clockwise) {
    constexpr double pi = 3.141592653589793238462643383279502884;
    geometry::linear_ring<double> ring;
    ring.reserve(n + 1);

    for (std::size_t i = 0; i < n; ++i) {
        const std::size_t index = clockwise ? n - i : i;
        const double angle = 2.0 * pi * static_cast<double>(index) / static_cast<double>(n);
        ring.push_back({cx + std::cos(angle) * radius, cy + std::sin(angle) * radius});
    }
    ring.push_back(ring.front());
    return ring;
}

geometry::polygon<double> donut(std::size_t n) {
    geometry::polygon<double> polygon;
    polygon.push_back(regularRing(n, 0, 0, 5000, false));
    polygon.push_back(regularRing(n, 0, 0, 2200, true));
    return polygon;
}

geometry::polygon<double> sawtoothSquare(std::size_t teethPerSide) {
    geometry::linear_ring<double> ring;
    ring.reserve(teethPerSide * 4 + 1);
    const double side = 10000;
    const double step = side / static_cast<double>(teethPerSide);

    for (std::size_t i = 0; i < teethPerSide; ++i) ring.push_back({-5000 + i * step, -5000 - (i % 2 ? 12.0 : 0.0)});
    for (std::size_t i = 0; i < teethPerSide; ++i) ring.push_back({5000 + (i % 2 ? 12.0 : 0.0), -5000 + i * step});
    for (std::size_t i = 0; i < teethPerSide; ++i) ring.push_back({5000 - i * step, 5000 + (i % 2 ? 12.0 : 0.0)});
    for (std::size_t i = 0; i < teethPerSide; ++i) ring.push_back({-5000 - (i % 2 ? 12.0 : 0.0), 5000 - i * step});
    ring.push_back(ring.front());

    return geometry::polygon<double>({ring});
}

void runCase(const std::string& name, const geometry::polygon<double>& polygon, double precision, std::size_t iterations) {
    auto p = polylabel(polygon, precision);
    sink += p.x + p.y;

    const auto start = std::chrono::steady_clock::now();
    double checksum = 0;
    for (std::size_t i = 0; i < iterations; ++i) {
        p = polylabel(polygon, precision);
        checksum += p.x * 0.0000001 + p.y * 0.0000003;
    }
    const auto stop = std::chrono::steady_clock::now();
    const std::chrono::duration<double, std::milli> elapsed = stop - start;
    sink += checksum;

    std::cout << std::left << std::setw(26) << name
              << " iterations=" << std::setw(5) << iterations
              << " total_ms=" << std::setw(12) << std::fixed << std::setprecision(3) << elapsed.count()
              << " ms_per_call=" << std::setw(10) << std::setprecision(6) << elapsed.count() / iterations
              << " result=(" << std::setprecision(6) << p.x << ", " << p.y << ")"
              << '\n';
}

int main() {
    const auto water1 = fixture("./test/fixtures/water1.json");
    const auto water2 = fixture("./test/fixtures/water2.json");
    const auto donut4096 = donut(4096);
    const auto square8192 = sawtoothSquare(2048);

    runCase("water1 precision 1", water1, 1.0, 400);
    runCase("water1 precision 50", water1, 50.0, 2000);
    runCase("water2 precision 1", water2, 1.0, 1000);
    runCase("donut 8194 vertices", donut4096, 5.0, 80);
    runCase("square 8193 vertices", square8192, 5.0, 80);

    std::cerr << "sink=" << sink << '\n';
}
