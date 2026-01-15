export default defineNuxtRouteMiddleware((to) => {
    if (to.path.startsWith('/docs')) {
        return abortNavigation({
            statusCode: 404,
            statusMessage: 'Document Not Found'
        })
    }
})