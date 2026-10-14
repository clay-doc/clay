import type {RouterConfig} from "@nuxt/schema";

// Pages scroll inside the content pane and render after navigation,
// so Markdown.vue scrolls to #anchors itself.
export default <RouterConfig>{
    scrollBehavior: () => false
};
