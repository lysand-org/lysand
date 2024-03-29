import type { RouteRecordRaw } from "vue-router";
import indexVue from "./pages/index.vue";
import authorizeVue from "./pages/oauth/authorize.vue";
import redirectVue from "./pages/oauth/redirect.vue";
import registerIndexVue from "./pages/register/index.vue";
import successVue from "./pages/register/success.vue";

export default [
	{ path: "/", component: indexVue },
	{ path: "/oauth/authorize", component: authorizeVue },
	{ path: "/oauth/redirect", component: redirectVue },
	{ path: "/register", component: registerIndexVue },
	{ path: "/register/success", component: successVue },
] as RouteRecordRaw[];
