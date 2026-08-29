data "aws_availability_zones" "available" {
  state = "available"
}
data "aws_caller_identity" "current" {}

locals {
  name            = "delia-${var.environment}"
  production      = var.environment == "production"
  azs             = slice(data.aws_availability_zones.available.names, 0, 2)
  api_domain      = var.api_domain_name != "" ? var.api_domain_name : (var.root_domain != "" ? "api.${var.root_domain}" : "")
  https           = var.certificate_arn != ""
  app_secret_keys = ["GEMINI_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS_JSON", "GOOGLE_CLOUD_PROJECT", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "NOTIFICATION_FROM"]
  common_env = [
    {
      name = "NODE_ENV", value = "production"
      }, {
      name = "API_PORT", value = "4000"
    },
    {
      name = "TRUST_PROXY_HOPS", value = "1"
      }, {
      name = "LOG_LEVEL", value = "log"
    },
    {
      name = "WEB_ORIGIN", value = var.web_origin
    },
    {
      name = "GOOGLE_OAUTH_REDIRECT_URI", value = "${var.api_origin}/api/auth/google/callback"
    },
    {
      name = "DB_HOST", value = aws_db_instance.main.address
      }, {
      name = "DB_PORT", value = "5432"
    },
    {
      name = "DB_NAME", value = "delia"
      }, {
      name = "DB_USER", value = "delia"
    },
    {
      name = "GEMINI_MODEL", value = "gemini-3.1-flash-lite"
    },
    {
      name = "RAG_V2_ENABLED", value = "true"
      }, {
      name = "RAG_INDEXER_ENABLED", value = "true"
    },
    {
      name = "GOOGLE_TTS_ENABLED", value = "true"
      }, {
      name = "GOOGLE_STT_ENABLED", value = "true"
    }
  ]
  common_secrets = concat([
    {
      name = "DB_PASSWORD", valueFrom = "${aws_secretsmanager_secret.database.arn}:password::"
    },
    {
      name = "ADMIN_API_TOKEN", valueFrom = aws_secretsmanager_secret.admin.arn
    }
    ], [for key in local.app_secret_keys : {
      name = key, valueFrom = "${var.application_secret_arn}:${key}::"
  }])
  runtime_script = "export DATABASE_URL=\"postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?schema=public&sslmode=require\"; printf '%s' \"$GOOGLE_APPLICATION_CREDENTIALS_JSON\" > /tmp/google.json; export GOOGLE_APPLICATION_CREDENTIALS=/tmp/google.json;"
}

resource "aws_vpc" "main" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = {
    Name = "${local.name}-vpc"
  }
}
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  availability_zone       = local.azs[count.index]
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  map_public_ip_on_launch = true
  tags = {
    Name = "${local.name}-public-${count.index + 1}"
  }
}
resource "aws_subnet" "app" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index + 10)
  tags = {
    Name = "${local.name}-app-${count.index + 1}"
  }
}
resource "aws_subnet" "database" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index + 20)
  tags = {
    Name = "${local.name}-db-${count.index + 1}"
  }
}
resource "aws_eip" "nat" {
  domain     = "vpc"
  depends_on = [aws_internet_gateway.main]
}
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  depends_on    = [aws_internet_gateway.main]
}
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}
resource "aws_route_table" "app" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
}
resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
resource "aws_route_table_association" "app" {
  count          = 2
  subnet_id      = aws_subnet.app[count.index].id
  route_table_id = aws_route_table.app.id
}

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Public traffic to the Delia API load balancer"
  vpc_id      = aws_vpc.main.id
}
resource "aws_security_group" "api" {
  name        = "${local.name}-api"
  description = "Traffic between the load balancer and Delia API tasks"
  vpc_id      = aws_vpc.main.id
}
resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}
resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  count             = local.https ? 1 : 0
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}
resource "aws_vpc_security_group_egress_rule" "alb_to_api" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.api.id
  from_port                    = 4000
  to_port                      = 4000
  ip_protocol                  = "tcp"
}
resource "aws_vpc_security_group_ingress_rule" "api_from_alb" {
  security_group_id            = aws_security_group.api.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 4000
  to_port                      = 4000
  ip_protocol                  = "tcp"
}
resource "aws_vpc_security_group_egress_rule" "api_all" {
  security_group_id = aws_security_group.api.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
resource "aws_security_group" "database" {
  name   = "${local.name}-database"
  vpc_id = aws_vpc.main.id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }
}

resource "random_password" "database" {
  length  = 40
  special = false
}
resource "random_password" "admin" {
  length  = 48
  special = false
}
resource "aws_secretsmanager_secret" "database" {
  name                    = "${local.name}/database"
  recovery_window_in_days = local.production ? 30 : 0
}
resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id
  secret_string = jsonencode({
    username = "delia", password = random_password.database.result
  })
}
resource "aws_secretsmanager_secret" "admin" {
  name                    = "delia/${var.environment}/admin-token"
  recovery_window_in_days = local.production ? 30 : 0
}
resource "aws_secretsmanager_secret_version" "admin" {
  secret_id     = aws_secretsmanager_secret.admin.id
  secret_string = random_password.admin.result
}
resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.database[*].id
}
resource "aws_db_instance" "main" {
  identifier                = local.name
  engine                    = "postgres"
  engine_version            = "16.6"
  instance_class            = local.production ? "db.t4g.small" : "db.t4g.micro"
  db_name                   = "delia"
  username                  = "delia"
  password                  = random_password.database.result
  port                      = 5432
  allocated_storage         = 20
  max_allocated_storage     = 100
  storage_encrypted         = true
  multi_az                  = local.production
  db_subnet_group_name      = aws_db_subnet_group.main.name
  vpc_security_group_ids    = [aws_security_group.database.id]
  publicly_accessible       = false
  deletion_protection       = local.production
  backup_retention_period   = local.production ? 14 : 3
  copy_tags_to_snapshot     = true
  skip_final_snapshot       = !local.production
  final_snapshot_identifier = local.production ? "${local.name}-final" : null
}

resource "aws_ecr_repository" "api" {
  name                 = "${local.name}-api"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = !local.production
  image_scanning_configuration {
    scan_on_push = true
  }
}
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1, description = "Keep 25 images", selection = {
        tagStatus = "any", countType = "imageCountMoreThan", countNumber = 25
        }, action = {
        type = "expire"
      }
    }]
  })
}
resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}
resource "aws_cloudwatch_log_group" "api" {
  name              = "/delia/${var.environment}/api"
  retention_in_days = local.production ? 90 : 14
}

resource "aws_iam_role" "execution" {
  name = "${local.name}-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }, Action = "sts:AssumeRole"
    }]
  })
}
resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_iam_role_policy" "secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = [aws_secretsmanager_secret.database.arn, aws_secretsmanager_secret.admin.arn, var.application_secret_arn]
    }]
  })
}
resource "aws_iam_role" "task" {
  name               = "${local.name}-task"
  assume_role_policy = aws_iam_role.execution.assume_role_policy
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }
  container_definitions = jsonencode([{
    name = "api", image = "${aws_ecr_repository.api.repository_url}:${var.image_tag}", essential = true, command = ["sh", "-c", "${local.runtime_script} exec node apps/api/dist/main.js"], environment = local.common_env, secrets = local.common_secrets, portMappings = [{
      containerPort = 4000, protocol = "tcp"
      }], logConfiguration = {
      logDriver = "awslogs", options = {
        awslogs-group = aws_cloudwatch_log_group.api.name, awslogs-region = var.aws_region, awslogs-stream-prefix = "api"
      }
      }, healthCheck = {
      command = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""], interval = 30, timeout = 5, retries = 3, startPeriod = 30
    }
  }])
}
resource "aws_ecs_task_definition" "migration" {
  family                   = "${local.name}-migration"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }
  container_definitions = jsonencode([{
    name = "migration", image = "${aws_ecr_repository.api.repository_url}:${var.image_tag}", essential = true, command = ["sh", "-c", "${local.runtime_script} exec npm run db:deploy"], environment = local.common_env, secrets = local.common_secrets, logConfiguration = {
      logDriver = "awslogs", options = {
        awslogs-group = aws_cloudwatch_log_group.api.name, awslogs-region = var.aws_region, awslogs-stream-prefix = "migration"
      }
    }
  }])
}

resource "aws_lb" "api" {
  name                       = substr("${local.name}-api", 0, 32)
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = aws_subnet.public[*].id
  enable_deletion_protection = local.production
}
resource "aws_lb_target_group" "api" {
  name                 = substr("${local.name}-api", 0, 32)
  port                 = 4000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.main.id
  deregistration_delay = 30
  health_check {
    enabled  = true
    path     = "/api/ready"
    matcher  = "200"
    interval = 30
    timeout  = 5
  }
}
resource "aws_lb_listener" "api" {
  load_balancer_arn = aws_lb.api.arn
  port              = local.https ? 443 : 80
  protocol          = local.https ? "HTTPS" : "HTTP"
  certificate_arn   = local.https ? var.certificate_arn : null
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
resource "aws_lb_listener" "redirect" {
  count             = local.https ? 1 : 0
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      protocol    = "HTTPS"
      port        = "443"
      status_code = "HTTP_301"
    }
  }
}
resource "aws_ecs_service" "api" {
  name                               = "${local.name}-api"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.api.arn
  desired_count                      = var.desired_count
  launch_type                        = "FARGATE"
  health_check_grace_period_seconds  = 60
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  network_configuration {
    assign_public_ip = false
    subnets          = aws_subnet.app[*].id
    security_groups  = [aws_security_group.api.id]
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }
  depends_on = [aws_lb_listener.api]
}
resource "aws_appautoscaling_target" "api" {
  max_capacity       = local.production ? 8 : 3
  min_capacity       = max(1, min(var.desired_count, 2))
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}
resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  target_tracking_scaling_policy_configuration {
    target_value       = 65
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
resource "aws_appautoscaling_policy" "memory" {
  name               = "${local.name}-memory"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  target_tracking_scaling_policy_configuration {
    target_value       = 75
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
  }
}
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name  = "${local.name}-api-5xx"
  namespace   = "AWS/ApplicationELB"
  metric_name = "HTTPCode_ELB_5XX_Count"
  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
  }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}
resource "aws_cloudwatch_metric_alarm" "unhealthy" {
  alarm_name  = "${local.name}-unhealthy-hosts"
  namespace   = "AWS/ApplicationELB"
  metric_name = "UnHealthyHostCount"
  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix, TargetGroup = aws_lb_target_group.api.arn_suffix
  }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "breaching"
}

resource "aws_route53_record" "api" {
  count   = var.hosted_zone_id != "" && local.api_domain != "" ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = local.api_domain
  type    = "A"
  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}
resource "aws_amplify_app" "web" {
  name       = "${local.name}-web"
  build_spec = file("${path.module}/../amplify.yml")
  environment_variables = {
    VITE_API_ORIGIN = var.api_origin
  }
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|map|json)$)([^.]+$)/>"
    target = "/index.html"
    status = "200"
  }
}
resource "aws_amplify_branch" "main" {
  app_id            = aws_amplify_app.web.id
  branch_name       = "main"
  enable_auto_build = false
  stage             = "PRODUCTION"
}
resource "aws_amplify_domain_association" "web" {
  count       = var.root_domain != "" ? 1 : 0
  app_id      = aws_amplify_app.web.id
  domain_name = var.root_domain
  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = var.web_subdomain
  }
}
