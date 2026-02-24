import { onRequestPost as __api_auth_logout_js_onRequestPost } from "C:\\Users\\Malkus Arlemark\\Documents\\Innovatio-Brutalis\\innovatio-brutalis\\functions\\api\\auth\\logout.js"
import { onRequestPost as __api_auth_request_link_js_onRequestPost } from "C:\\Users\\Malkus Arlemark\\Documents\\Innovatio-Brutalis\\innovatio-brutalis\\functions\\api\\auth\\request-link.js"
import { onRequestGet as __api_auth_verify_js_onRequestGet } from "C:\\Users\\Malkus Arlemark\\Documents\\Innovatio-Brutalis\\innovatio-brutalis\\functions\\api\\auth\\verify.js"
import { onRequestPost as __api_export_batch_js_onRequestPost } from "C:\\Users\\Malkus Arlemark\\Documents\\Innovatio-Brutalis\\innovatio-brutalis\\functions\\api\\export\\batch.js"
import { onRequestGet as __api_export_customers_js_onRequestGet } from "C:\\Users\\Malkus Arlemark\\Documents\\Innovatio-Brutalis\\innovatio-brutalis\\functions\\api\\export\\customers.js"
import { onRequestGet as __api_export_invoices_js_onRequestGet } from "C:\\Users\\Malkus Arlemark\\Documents\\Innovatio-Brutalis\\innovatio-brutalis\\functions\\api\\export\\invoices.js"
import { onRequestGet as __api_orders__id__js_onRequestGet } from "C:\\Users\\Malkus Arlemark\\Documents\\Innovatio-Brutalis\\innovatio-brutalis\\functions\\api\\orders\\[id].js"
import { onRequestGet as __api_health_js_onRequestGet } from "C:\\Users\\Malkus Arlemark\\Documents\\Innovatio-Brutalis\\innovatio-brutalis\\functions\\api\\health.js"
import { onRequestGet as __api_me_js_onRequestGet } from "C:\\Users\\Malkus Arlemark\\Documents\\Innovatio-Brutalis\\innovatio-brutalis\\functions\\api\\me.js"
import { onRequestPut as __api_me_js_onRequestPut } from "C:\\Users\\Malkus Arlemark\\Documents\\Innovatio-Brutalis\\innovatio-brutalis\\functions\\api\\me.js"
import { onRequestPut as __api_me_addresses_js_onRequestPut } from "C:\\Users\\Malkus Arlemark\\Documents\\Innovatio-Brutalis\\innovatio-brutalis\\functions\\api\\me-addresses.js"
import { onRequestGet as __api_orders_js_onRequestGet } from "C:\\Users\\Malkus Arlemark\\Documents\\Innovatio-Brutalis\\innovatio-brutalis\\functions\\api\\orders.js"

export const routes = [
    {
      routePath: "/api/auth/logout",
      mountPath: "/api/auth",
      method: "POST",
      middlewares: [],
      modules: [__api_auth_logout_js_onRequestPost],
    },
  {
      routePath: "/api/auth/request-link",
      mountPath: "/api/auth",
      method: "POST",
      middlewares: [],
      modules: [__api_auth_request_link_js_onRequestPost],
    },
  {
      routePath: "/api/auth/verify",
      mountPath: "/api/auth",
      method: "GET",
      middlewares: [],
      modules: [__api_auth_verify_js_onRequestGet],
    },
  {
      routePath: "/api/export/batch",
      mountPath: "/api/export",
      method: "POST",
      middlewares: [],
      modules: [__api_export_batch_js_onRequestPost],
    },
  {
      routePath: "/api/export/customers",
      mountPath: "/api/export",
      method: "GET",
      middlewares: [],
      modules: [__api_export_customers_js_onRequestGet],
    },
  {
      routePath: "/api/export/invoices",
      mountPath: "/api/export",
      method: "GET",
      middlewares: [],
      modules: [__api_export_invoices_js_onRequestGet],
    },
  {
      routePath: "/api/orders/:id",
      mountPath: "/api/orders",
      method: "GET",
      middlewares: [],
      modules: [__api_orders__id__js_onRequestGet],
    },
  {
      routePath: "/api/health",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_health_js_onRequestGet],
    },
  {
      routePath: "/api/me",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_me_js_onRequestGet],
    },
  {
      routePath: "/api/me",
      mountPath: "/api",
      method: "PUT",
      middlewares: [],
      modules: [__api_me_js_onRequestPut],
    },
  {
      routePath: "/api/me-addresses",
      mountPath: "/api",
      method: "PUT",
      middlewares: [],
      modules: [__api_me_addresses_js_onRequestPut],
    },
  {
      routePath: "/api/orders",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_orders_js_onRequestGet],
    },
  ]