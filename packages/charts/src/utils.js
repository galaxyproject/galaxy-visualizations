/** This class handles, formats and caches datasets. */
import _ from "underscore";

/**
 * Safely merge to dictionaries
 * @param{Object}   options         - Target dictionary
 * @param{Object}   optionsDefault  - Source dictionary
 */
export function merge(options, optionsDefault) {
    if (options) {
        return _.defaults(options, optionsDefault);
    } else {
        return optionsDefault;
    }
}

/**
 * Request handler for GET
 * @param{String}   url     - Url request is made to
 * @param{Function} success - Callback on success
 * @param{Function} error   - Callback on error
 * @param{Boolean}  cache   - Use cached data if available
 */
export function getAjax(options) {
    top.__utils__get__ = top.__utils__get__ || {};
    var cache_key = JSON.stringify(options);
    if (options.cache && top.__utils__get__[cache_key]) {
        if (options.success) {
            options.success(top.__utils__get__[cache_key]);
        }
        window.console.debug(`get() - Fetching from cache [${options.url}].`);
    } else {
        requestAjax({
            url: options.url,
            data: options.data,
            success: function (response) {
                top.__utils__get__[cache_key] = response;
                if (options.success) {
                    options.success(response);
                }
            },
            error: function (response, status) {
                if (options.error) {
                    options.error(response, status);
                }
            },
        });
    }
}

/**
 * Request handler
 * @param{String}   method  - Request method ['GET', 'POST', 'DELETE', 'PUT']
 * @param{String}   url     - Url request is made to
 * @param{Object}   data    - Data send to url
 * @param{Function} success - Callback on success
 * @param{Function} error   - Callback on error
 */
export function requestAjax(options) {
    // prepare ajax
    var ajaxConfig = {
        contentType: "application/json",
        type: options.type || "GET",
        data: options.data || {},
        url: options.url,
    };
    // encode data into url
    if (ajaxConfig.type == "GET" || ajaxConfig.type == "DELETE") {
        if (!$.isEmptyObject(ajaxConfig.data)) {
            ajaxConfig.url += ajaxConfig.url.indexOf("?") == -1 ? "?" : "&";
            ajaxConfig.url += $.param(ajaxConfig.data, true);
        }
        ajaxConfig.data = null;
    } else {
        ajaxConfig.dataType = "json";
        ajaxConfig.data = JSON.stringify(ajaxConfig.data);
    }

    // make request
    $.ajax(ajaxConfig)
        .done((response) => {
            if (typeof response === "string") {
                try {
                    response = response.replace("Infinity,", '"Infinity",');
                    response = $.parseJSON(response);
                } catch (e) {
                    console.debug(e);
                }
            }
            if (options.success) {
                options.success(response);
            }
        })
        .fail((response) => {
            var response_text = null;
            try {
                response_text = $.parseJSON(response.responseText);
            } catch (e) {
                response_text = response.responseText;
            }
            if (options.error) {
                options.error(response_text, response.status);
            }
        })
        .always(() => {
            if (options.complete) {
                options.complete();
            }
        });
}
