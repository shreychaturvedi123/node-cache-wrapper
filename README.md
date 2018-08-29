# node-cache-wrapper
Cache wrapper in node js for wrapping your functions with fail-over data source handling to serve stale data from cache

Currently 2 stores are supported.

 - Memory
 - Redis

Use Redis for persistent caches.

Usage
------

```
var node_cache_wrapper = require('node-cache-wrapper');

// create a cache with max 10000 items and a TTL of 300 seconds

var failoverCache =   node_cache_wrapper.debug.register(new node_cache_wrapper.Create({
            id: 2,
            expiry:  300,
            failover_expiry:  30, // in secs
            redis: {host:'localhost', port: 6379},
            hash:  1 // for key hashing
          }), 'failoverCache');
          
          
          // test function
        function test(a, b, cb) {
            //async call any to your db , api etc
            db.get("foo1", function(err, res) {
                return cb(null, res);
            });
        }

        var cTest = failoverCache.wrap(test);

        cTest(2, 3, function(err, res) {
            console.log(err, res);
        });

//that's it get the cached result now
        
