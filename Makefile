CXXFLAGS += -Iinclude -std=c++14 -Wall -Wextra -Wshadow -Werror -g -fPIC

MASON ?= .mason/mason
VARIANT = variant 1.1.4
GEOMETRY = geometry 0.9.2
RAPIDJSON = rapidjson 1.1.0

DEPS = `$(MASON) cflags $(VARIANT)` \
       `$(MASON) cflags $(GEOMETRY)` \
       `$(MASON) cflags $(RAPIDJSON)`

mason_packages/headers/geometry:
	$(MASON) install $(VARIANT)
	$(MASON) install $(GEOMETRY)
	$(MASON) install $(RAPIDJSON)

build:
	mkdir -p build

build/test: test/test.cpp include/mapbox/polylabel.hpp build mason_packages/headers/geometry
	$(CXX) $(CFLAGS) $(CXXFLAGS) $(DEPS) $< -o $@

test: build/test
	./build/test
