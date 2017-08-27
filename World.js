const World = {

};

/*
World in which players can collect and see eachother.
This should be able to hold all data about players
that is visible for other players

- Location and direction
- Item holding
-
- Health and chat bar ??
*/

class World {

}

/*
IDEA

Make filter functions that belong to a observable source, e.g.

Time$
  .filter(Time.every(1000))
  ...

World.changes$
  .filter(World.max_distance(100))
  ...

These special filters could be detected, and have some
special optimizations applied instead of just the filter.
*/
