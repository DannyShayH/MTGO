import { Module } from "@medusajs/framework/utils"
import RoutingModuleService from "./service"

export const ROUTING_MODULE = "routing"
export default Module(ROUTING_MODULE, { service: RoutingModuleService })
