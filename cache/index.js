"use strict";
/*jslint undef: true */

var sigmund = require('sigmund');
var log = require('debug')('scache');
var util = require('util');
var _ = require('lodash');
var lru = require('./lru');


var hash = require('object-hash');

function keygen(name, args) {
    var input = { f: name, a: args };
    return sigmund(input, 8);
}

function CacheError() {
    Error.captureStackTrace(this, CacheError);
}

util.inherits(CacheError, Error);

//for testing
// var store;

var cache = {

    Error: CacheError,

    /**
     * ## cache.Create
     *
     * Constructor
     *
     * @param {Object} Cache Options
     * ```js
     * {
     *  reset: {
     *    interval: 10000, // msec reset interval
     *    firstReset: 1000, // time for first reset (optional)
     *  },
     *  maxAge: 10000 // lru max age
     *  ...
     * }
     *
     * ```
     *
     **/
    Create: function(options) {
        var anonFnId = 0;
        var store;
        var that = this;

        if (options && options.redis) {
            log('creating a redis cache');
            store = require('./redis').init(options);
        } else {
            store = require('./lru').init(options);
        }

        if (!store) {
            throw new Error('No cache store provided');
        }

        this.store = store;


        this.expiry = options.expiry || 300;

        this.failover_expiry = options.failover_expiry || 0;


        //TO DO for stats (datadog)
        this.stats = { hit: 0, miss: 0, reset: 0 };

        /**
         *
         * ## cache.wrap
         *
         * @param {Function} function to be wrapped
         * @param {Object} this object for the function being wrapped. Optional
         * @return {Function} Wrapped function that is cache aware
         *
         *
         * Given a function, generates a cache aware version of it.
         * The given function must have a callback as its last argument
         * skipArgs is the array of indexes for which arguments should 
         * be skipped for key generation
         *
         **/
        this.wrap = function(fn, thisobj, skipArgs) {
            var stats = this.stats;
            var fname = (fn.name || '_') + anonFnId++;
            var cachedfunc;

            log('wrapping function ' + fname);

            cachedfunc = function() {
                var self = thisobj || this;
                var args = Array.prototype.slice.apply(arguments);
                var callback = args.pop();
                var key, data, keyArgs;

                if (typeof callback !== 'function') {
                    throw new Error('last argument to ' + fname + ' should be a function');
                }

                if (skipArgs && skipArgs.length) {
                    keyArgs = args.filter(function(a, i) {
                        return skipArgs.indexOf(i) === -1;
                    });
                } else {
                    keyArgs = args;
                }

                //get key if already in argument
                if (args[0] && args[0].cache_key) {

                    key = options.hash ? hash(args[0].cache_key) : args[0].cache_key;
                } else {
                    key = keygen(fname, keyArgs);
                }


                log('fetching from cache ' + key);
                data = store.get(key, onget);

                function onget(err, data) {
                    var v;

                    if (!err && data != undefined && !checkExpiry(data, that.expiry)) {
                        that.expiry = options.expiry || 300;

                        log('cache hit' + key);
                        process.nextTick(function() {
                            if (data) data = _.omit(data, 'ts');

                            callback.call(self, err, data); // found in cache
                        });
                        stats.hit++;
                        return;
                    }

                    log('cache miss ' + key);

                    // this gets called when the original function returns.
                    // we will first save the result in cache, and then 
                    // call the callback
                    args.push(function(err, res) {
                        if (!err && res) {
                            log('saving key ' + key);

                            //add epoch ts
                            if (res) res.ts = (new Date()).valueOf();

                            store.set(key, res);
                        }

                        if (err && (err instanceof CacheError) || !res) {
                            log('skipping from cache, overwriting error');
                            err = undefined;

                            if (that.failover_expiry) {
                                //send failover response with increased ttl\
                                data.ts = (new Date()).valueOf() + (that.failover_expiry * 1000);

                                res = data;

                                //reset expiry to failover expiry
                                that.expiry = that.failover_expiry;

                                //save failed data
                                store.set(key, res);
                            }

                        }

                        if (res) res = _.omit(res, 'ts');

                        callback.call(self, err, res);

                    });

                    fn.apply(self, args);
                    return stats.miss++;
                }

            };
            log('created new cache function with name ' + fname + JSON.stringify(options));
            cachedfunc.cacheName = fname;
            return cachedfunc;
        };
    },
    debug: require('./debug')

};


function checkExpiry(data, expiry) {

    return (Math.floor(((new Date()).valueOf() - data.ts) / 1000) > expiry);
}

module.exports = cache;





//------------- TEST ------------------

(function() {
    if (require.main === module) {

        // test function
        function test(a, b, cb) {

            store.get("foo1", function(err, res) {
                return cb(null, res);
            });
        }


        //time in seconds

        var cr = cache.debug.register(new cache.Create({
            id: 2,
            expiry: 300,
            failover_expiry: 30,
            redis: {
                host: '127.0.0.1',
                port: 6379
            }
        }), 'productCache');
        //cache.Create({ id: 3434, redis: { host: 'localhost', port: 6379 } });

        var cTest = cr.wrap(test);

        cTest(2, 3, function(err, res) {
            console.log(err, res);
        });

    }
}());