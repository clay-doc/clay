// /docs/ holds the files next to the docs (images, downloads), served as they
// are; an address there that is not a file is no page either
export default defineNuxtRouteMiddleware((to) => {
    if (/^\/docs(\/|$)/.test(to.path)) {
        return abortNavigation({
            statusCode: 404,
            statusMessage: 'Document Not Found'
        })
    }
})
