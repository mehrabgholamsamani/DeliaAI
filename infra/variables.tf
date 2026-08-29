variable "aws_region" {
  type    = string
  default = "eu-central-1"
}
variable "environment" {
  type    = string
  default = "staging"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.environment))
    error_message = "Use 2-21 lowercase letters, numbers, or hyphens."
  }
}
variable "web_origin" {
  type = string
}
variable "api_origin" {
  type = string
}
variable "image_tag" {
  type    = string
  default = "bootstrap"
}
variable "desired_count" {
  type    = number
  default = 1
}
variable "application_secret_arn" {
  type      = string
  sensitive = true
}
variable "certificate_arn" {
  type    = string
  default = ""
}
variable "hosted_zone_id" {
  type    = string
  default = ""
}
variable "root_domain" {
  type    = string
  default = ""
}
variable "api_domain_name" {
  type    = string
  default = ""
}
variable "web_subdomain" {
  type    = string
  default = "app"
}
