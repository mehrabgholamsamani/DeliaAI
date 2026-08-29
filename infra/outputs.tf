output "ecr_repository_url" { value = aws_ecr_repository.api.repository_url }
output "ecs_cluster_name" { value = aws_ecs_cluster.main.name }
output "migration_task_definition_arn" { value = aws_ecs_task_definition.migration.arn }
output "application_subnet_ids" { value = aws_subnet.app[*].id }
output "api_security_group_id" { value = aws_security_group.api.id }
output "amplify_app_id" { value = aws_amplify_app.web.id }
output "load_balancer_dns_name" { value = aws_lb.api.dns_name }
