export default defineNuxtRouteMiddleware((to) => {
    if (!to.path.startsWith("/docs") && (to.path.endsWith('.md') || to.path.endsWith(".html"))) {
        return navigateTo(to.path.replace(/\.md$|\.html$/i, ''));
    }
})