
var Bugzilla = {

    /**
     * options = {bugId, success, error}
     */

    getBugById: function Bugzilla_getBugById(options) {
        var data = {};
        if (options.credentials) {
            data.username = options.credentials.username;
            data.password = options.credentials.password;
        }
        $.ajax({
            url: "https://api-dev.bugzilla.mozilla.org/latest/bug/" + parseInt(options.bugId),
            data: data,
            type: "GET",
            dataType: "json",
            success: function (json) {
                options.success(json);
            },
            error: function(xhr, status) {
                options.error(); // TODO Improve this
            }
        });
    },

    getBugs: function Bugzilla_getBugs(options) {
        var data = {};
        if (options.credentials) {
            data.username = options.credentials.username;
            data.password = options.credentials.password;
        }
        $.each(['classification', 'component', 'product'], function(index, value) {
            if (options[value]) {
                data[value] = options[value];
            }
        });
        $.ajax({
            url: "https://api-dev.bugzilla.mozilla.org/latest/bug",
            data: data,
            type: "GET",
            dataType: "json",
            success: function (json) {
                options.success(json.bugs);
            },
            error: function(xhr, status) {
                options.error(); // TODO Improve this
            }
        });
    },

    /**
     * There is no concept of logging in in the Bugzilla API so all we do is
     * simply request a bug with credentials.
     */

    login: function Bugzilla_login(options) {
        Bugzilla.getBugById({
            bugId: 35,
            credentials: options.credentials,
            success: function(bug) {
                options.success();
            },
            error: function() {
                options.error();
            }
        })
    }

};