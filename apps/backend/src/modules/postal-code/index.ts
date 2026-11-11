import { Module } from "@medusajs/framework/utils"
import PostalCodeModuleService from "./service"

export const POSTAL_CODE_MODULE = "postalCode"
export default Module(POSTAL_CODE_MODULE, { service: PostalCodeModuleService })
