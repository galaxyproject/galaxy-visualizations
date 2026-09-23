// A driver that names a real provider must not actually reach it: the brain boots here.
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/;
module.exports = (page) =>
    page.route("**/*", (route) => (LOCAL.test(route.request().url()) ? route.continue() : route.abort()));
