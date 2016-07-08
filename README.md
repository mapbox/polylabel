A fast algorithm for finding polygon _pole of inaccessibility_,
the most distant internal point from the polygon outline (not to be confused with centroid),
implemented as a JavaScript library.
Useful for optimal placement of a text label on a polygon.

It's an iterative grid algorithm,
inspired by [paper by Garcia-Castellanos & Lombardo, 2007](https://sites.google.com/site/polesofinaccessibility/).
Unlike the one in the paper, this algorithm:

- guarantees finding global optimum within the given precision
- is many times faster (6-20x)

<img src="https://cloud.githubusercontent.com/assets/25395/16695332/e0b71a24-4547-11e6-868f-6c85744bc083.png">
