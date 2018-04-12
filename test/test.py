#!/usr/bin/env python
# -*- coding: utf-8 -*-
import json
import sys
sys.path.append('..')
from python.polylabel import Polylabel


def test_case_water1():
    pl = Polylabel(percision=1.0)
    with open('./fixtures/water1.json') as fh:
        data = json.load(fh)
    res = pl.polylabel(data)
    print res
    assert str(res) == "(3865.85009765625, 2124.87841796875)"

def test_case_water2():
    pl = Polylabel(percision=1.0)
    with open('./fixtures/water2.json') as fh:
        data = json.load(fh)
    res = pl.polylabel(data)
    print res
    assert str(res) == "(3263.5, 3263.5)"

def test_case_simple_polygon():
    simple_polygon = [
        [
            [47.9110451487389, -44.1096212330437],
            [47.8991367655973, -71.2555371703825],
            [47.8994056568125, -77.227879331536],
            [45.3626133593456, -77.2222141041101],
            [45.3688717696369, -80.4158717914029],
            [34.2709994158039, -80.4094586953846],
            [34.2635145329713, -55.2594231186565],
            [18.1742987232491, -55.2501256891529],
            [18.1817831793031, -80.4001618747756],
            [8.8880123733129, -80.3947913098013],
            [8.88803613296443, -80.4746328778399],
            [3.61157281151532, -80.4715837829468],
            [3.60074437508024, -44.0838724342666],
            [47.9110451487389, -44.1096212330437],
            [47.9110451487389, -44.1096212330437]
        ]
    ]
    pl = Polylabel(percision=1.0)
    res = pl.polylabel(simple_polygon)
    print res
    assert str(res) == "(10.992617590181066, -52.612956913229084)"


if __name__ == "__main__":
    # test_case_water1()
    test_case_water2()
    test_case_simple_polygon()
