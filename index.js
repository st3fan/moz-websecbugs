
var app = angular.module('blockers', []);

app.run(function($rootScope, sessionService, bugzillaService) {
    $rootScope.ready = false;
    $rootScope.loggedIn = false;

    $rootScope.$on("BugzillaLoginSuccess", function(event, args) {
        sessionService.setCredentials(args.credentials);
        $rootScope.ready = true;
        $rootScope.loggedIn = true;
    });

    $rootScope.$on("BugzillaLogoutSuccess", function() {
        sessionService.clearCredentials();
        $rootScope.loggedIn = false;
    });

    var credentials = sessionService.getCredentials();
    if (credentials) {
        bugzillaService.login(credentials.username, credentials.password);
    } else {
        $rootScope.ready = true;
    }
});

app.factory('preferencesService', function () {
    var sharedPreferencesService = {};

    sharedPreferencesService.setUsername = function(username) {
        localStorage.setItem("username", username);
    };

    sharedPreferencesService.getUsername = function() {
        return localStorage.getItem("username");
    };

    return sharedPreferencesService;
});

app.factory('sessionService', function () {
    return {
        setCredentials: function (credentials) {
            sessionStorage.setItem("credentials_username", credentials.username);
            sessionStorage.setItem("credentials_password", credentials.password);
        },
        getCredentials: function () {
            var c = {username: sessionStorage.getItem("credentials_username"), password: sessionStorage.getItem("credentials_password")};
            if (c.username && c.password) {
                return c;
            } else {
                return undefined;
            }
        },
        clearCredentials: function () {
            sessionStorage.removeItem("credentials_username");
            sessionStorage.removeItem("credentials_password");
        }
    };
});

app.factory('bugzillaService', function ($rootScope, $http, sessionService)
{
    var sharedBugzillaService = {};

    sharedBugzillaService.cleanupBug = function(bug) {
        bug.creation_time = Date.parse(bug.creation_time);
        //bug.last_change_time = Date.parse(bug.last_change_time);

        bug.age = Math.floor((Date.now() - bug.creation_time) / (24 * 60 * 60 * 1000));

        bug.label = "default";
        if (bug.age < 7) {
            bug.label = "success";
        } else if (bug.age < 28) {
            bug.label = "warning";
        } else {
            bug.label = "important";
        }
    };

    sharedBugzillaService.login = function BugzillaService_login(username, password)
    {
        var params = {
            username: username,
            password: password
        };

        $http({url: "https://api-dev.bugzilla.mozilla.org/latest/bug/38", method:"GET", params:params})
            .success(function(/*data*/) {
                sharedBugzillaService.credentials = {username: username, password: password};
                $rootScope.$broadcast("BugzillaLoginSuccess", {credentials:{username:username,password:password}});
            })
            .error(function(/*data, status, headers, config*/){
                $rootScope.$broadcast("BugzillaLoginFailure");
            });
    };

    sharedBugzillaService.logout = function()
    {
        sharedBugzillaService.credentials = undefined;
        sessionService.clearCredentials();
        $rootScope.$broadcast("BugzillaLogoutSuccess");
    };

    sharedBugzillaService.getBugs = function(options)
    {
        const fieldsThatNeedMultipleParameters = ['product', 'component', 'status', 'resolution'];

        var query = "";

        var appendParameter = function(q, name, value) {
            if (q.length > 0) {
                q += "&";
            }
            return q + encodeURIComponent(name) + "=" + encodeURIComponent(value);
        };

        for (var optionName in options) {
            if (options.hasOwnProperty(optionName)) {
                switch (optionName) {
                    case "advanced": {
                        _.each(options["advanced"], function (t, i) {
                            query = appendParameter(query, "field" + i + "-0-0", t[0]);
                            query = appendParameter(query, "type" + i + "-0-0", t[1]);
                            if (t.length == 3) {
                                query = appendParameter(query, "value" + i + "-0-0", t[2]);
                            }
                        });
                        break;
                    }
                    default: {
                        if (options[optionName] instanceof Array) {
                            if (fieldsThatNeedMultipleParameters.indexOf(optionName) != -1) {
                                _.each(options[optionName], function (value) {
                                    query = appendParameter(query, optionName, value);
                                });
                            } else {
                                query = appendParameter(query, optionName, options[optionName].join(','));
                            }
                        } else {
                            query = appendParameter(query, optionName, options[optionName]);
                        }
                    }
                }
            }
        }

        if (sharedBugzillaService.credentials) {
            query = appendParameter(query, "username", sharedBugzillaService.credentials.username);
            query = appendParameter(query, "password", sharedBugzillaService.credentials.password);
        }

        return $http({url: "https://api-dev.bugzilla.mozilla.org/latest/bug?" + query, method:"GET"});
    };

    sharedBugzillaService.isLoggedIn = function() {
        return this.credentials != undefined;
    };

    return sharedBugzillaService;
});

app.controller('ApplicationController', function() {
});

app.controller('SigninController', function ($scope, $rootScope, $http, bugzillaService, preferencesService) {
    $scope.bugzillaService = bugzillaService;
    $scope.error = undefined;

    $scope.username = "";
    $scope.password = "";
    $scope.rememberMe = undefined;

    if (preferencesService.getUsername() != "") {
        $scope.username = preferencesService.getUsername();
        $scope.rememberMe = true;
    }

    $scope.signin = function() {
        $scope.error = undefined;
        bugzillaService.login($scope.username, $scope.password);
    };

    $scope.$on("BugzillaLoginSuccess", function() {
        if ($scope.rememberMe) {
            preferencesService.setUsername($scope.username);
        } else {
            preferencesService.setUsername("");
            $scope.username = "";
        }
        $scope.password = "";
    });
});

app.controller('PageController', function ($scope, $http, bugzillaService) {
    $scope.bugzillaService = bugzillaService;
    $scope.loading = true;
    $scope.username = undefined;

    $scope.bugs = [];
    $scope.sites = {};
    $scope.projectReviewBugs = [];
    $scope.blockingBugs = {};

    $scope.$on("BugzillaLoginSuccess", function(event, args) {
        $scope.username = args.credentials.username;
        $scope.reload();
    });

    $scope.logout = function() {
        $scope.bugzillaService.logout();
    };

    const MOCO_SITES = ["www.mozilla.com", "plugins.mozilla.org", "forums.mozilla.org", "addons.mozilla.org", "developer.mozilla.org", "vreplay.mozilla.com"];
    const MOFO_SITES = ["www.drumbeat.org", "donate.mozilla.org", "thimble.webmaker.org", "2011.mozillafestival.org", "popcorn.webmadecontent.org", "popcorn.webmaker.org"];

    $scope.filterName = "all";
    $scope.sortName = "count";

    $scope.filter = function(what) {
        $scope.filterName = what;

        switch (what) {
            case "all": {
                $scope.sites = $scope.allSites;
                break;
            }
            case "moco": {
                $scope.sites = _.filter($scope.allSites, function(site) {return MOCO_SITES.indexOf(site.name) != -1;});
                break;
            }
            case "mofo": {
                $scope.sites = _.filter($scope.allSites, function(site) {return  MOFO_SITES.indexOf(site.name) != -1;});
                break;
            }
        }

        $scope.sort($scope.sortName);
    };

    $scope.sort = function(what) {
        $scope.sortName = what;

        switch (what) {
            case "count": {
                $scope.sites = _.sortBy($scope.sites, function(site) { return site.unconfirmed + site.new; }).reverse();
                break;
            }
            case "age": {
                $scope.sites = _.sortBy($scope.sites, function(site) { return site.averageAge; }).reverse();
                break;
            }
        }
    };

    $scope.reload = function()
    {
        // First we get the project review bugs

        var options = {
            include_fields:"id,creation_time,summary,status,whiteboard",
            advanced: [["status_whiteboard", "substring", "[site:"], ["bug_group", "substring", "websites-security"]]
        };

        var parseSites = function parseSites(s) {
            var sites = [];
            _.each(s.match(/(\[site:(.+?)\])/gi), function (match) {
                sites.push(/\[site:(.+?)\]/.exec(match)[1]);
            });
            return sites;
        };

        bugzillaService.getBugs(options)
            .success(function(data) {
                $scope.bugs = data.bugs;
                $scope.loading = false;

                // Loop over all bugs and group sites

                var sites = {};
                _.each($scope.bugs, function(bug) {
                    bugzillaService.cleanupBug(bug);
                    _.each(parseSites(bug['whiteboard']), function (site) {
                        if (!sites[site]) {
                            sites[site] = {name:site,unconfirmed:0,resolved:0,new:0,verified:0,averageAge:0};
                        }
                        sites[site][bug.status.toLowerCase()]++;
                        if (bug.status === 'UNCONFIRMED' || bug.status === 'NEW') {
                            sites[site].averageAge += bug.age;
                        }
                    });
                });

                _.each(sites, function(site) {
                    site.averageAge = Math.floor(site.averageAge / (site.new + site.unconfirmed));
                    site.averageAgeLabel = "default";
                    if (site.averageAge < 7) {
                        site.averageAgeLabel = "success";
                    } else if (site.averageAge< 24) {
                        site.averageAgeLabel = "warning";
                    } else {
                        site.averageAgeLabel = "important";
                    }
                    site.bugzillaAllOpenBugsLink = "https://bugzilla.mozilla.org/buglist.cgi?type0-1-0=substring;field0-1-0=status_whiteboard;field0-0-0=bug_group;query_format=advanced;value0-1-0=[site%3A" + site.name + "];bug_status=UNCONFIRMED;bug_status=NEW;type0-0-0=equals;value0-0-0=websites-security";
                });

                $scope.allSites = _.chain(sites)
                    .values()
                    .filter(function (site) { return site.new > 0 || site.unconfirmed > 0 })
                    .value();

                $scope.filter('all');
            })
            .error(function (data, status) {
                console.log("Error getting bugs", data, status);
            });
    };
});
