// Jenkinsfile for gakhalmo-front-test (vite static SPA served by nginx)
//
// gakhalmo-back Jenkinsfile 과 동일한 안전장치:
//   1. disableConcurrentBuilds — NFS 워크스페이스 경합 방지
//   2. kaniko --cache-repo 를 env(dev|prod) 별로 분리
//   3. buildDiscarder, timeout
// 특이 사항: 정적 자산이라 별도 lint/test 스테이지 없이 바로 빌드/푸시.

pipeline {
    agent none

    options {
        disableConcurrentBuilds()
        timeout(time: 20, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '5'))
    }

    environment {
        OCIR_REGISTRY = 'yny.ocir.io'
        OCIR_NAMESPACE = 'axlgn2n9ijoa'
        IMAGE_NAME = 'gakhalmo/front-test'
        GITOPS_REPO = 'https://github.com/leestana01/gitops.git'
        GITOPS_CREDENTIALS = 'github-credentials'
    }

    stages {
        stage('Resolve env') {
            agent {
                kubernetes {
                    label 'gakhalmo-front-test-resolve'
                    yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: shell
      image: docker.io/alpine:3.20
      command: ['cat']
      tty: true
"""
                }
            }
            steps {
                script {
                    // temp-front 는 dev 단일 환경(테스트용). main 머지도 dev 에 재배포한다 —
                    // 머지 직후 배포 이미지가 develop 최종 상태와 main 이 일치한다는 것을
                    // 한 번 더 확인하는 역할.
                    if (env.BRANCH_NAME == 'main' || env.BRANCH_NAME == 'develop') {
                        env.TARGET_ENV = 'dev'
                        env.GITOPS_KUSTOMIZE_DIR = 'apps/temp-front/overlays/dev'
                    } else {
                        error "Branch ${env.BRANCH_NAME} is not configured for deployment"
                    }
                    env.IMAGE_TAG = "${env.TARGET_ENV}-${env.BUILD_NUMBER}"
                    env.FULL_IMAGE = "${OCIR_REGISTRY}/${OCIR_NAMESPACE}/${IMAGE_NAME}:${env.IMAGE_TAG}"
                    env.KANIKO_CACHE_REPO = "${OCIR_REGISTRY}/${OCIR_NAMESPACE}/${IMAGE_NAME}/cache/${env.TARGET_ENV}"

                    echo "TARGET_ENV=${env.TARGET_ENV}"
                    echo "IMAGE_TAG=${env.IMAGE_TAG}"
                    echo "KANIKO_CACHE_REPO=${env.KANIKO_CACHE_REPO}"
                }
            }
        }

        stage('Build & Push Docker Image') {
            agent {
                kubernetes {
                    label 'gakhalmo-front-test-kaniko'
                    yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: tools
      image: docker.io/bitnami/kubectl:latest
      command: ['cat']
      tty: true
      securityContext:
        runAsUser: 0
    - name: kaniko
      image: gcr.io/kaniko-project/executor:debug
      command: ['/busybox/cat']
      tty: true
      volumeMounts:
        - name: docker-config
          mountPath: /kaniko/.docker
  volumes:
    - name: docker-config
      secret:
        secretName: ocir-kaniko-secret
"""
                }
            }
            steps {
                container('tools') {
                    sh """
                        kubectl exec -n jenkins \$(hostname) -c kaniko -- /kaniko/executor \\
                            --context=dir://\${WORKSPACE} \\
                            --dockerfile=\${WORKSPACE}/Dockerfile \\
                            --customPlatform=linux/arm64 \\
                            --destination=${env.FULL_IMAGE} \\
                            --destination=${OCIR_REGISTRY}/${OCIR_NAMESPACE}/${IMAGE_NAME}:${env.TARGET_ENV} \\
                            --cache=true \\
                            --cache-repo=${env.KANIKO_CACHE_REPO} \\
                            --cache-ttl=168h
                    """
                }
            }
        }

        stage('Update GitOps Repository') {
            agent {
                kubernetes {
                    label 'gakhalmo-front-test-gitops'
                    yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: git
      image: docker.io/alpine/git:latest
      command: ['cat']
      tty: true
"""
                }
            }
            steps {
                container('git') {
                    withCredentials([usernamePassword(credentialsId: "${GITOPS_CREDENTIALS}", usernameVariable: 'GIT_USER', passwordVariable: 'GIT_TOKEN')]) {
                        sh '''
                            set +x
                            rm -rf gitops-repo
                            GIT_AUTH_HEADER="Authorization: Basic $(printf '%s:%s' "$GIT_USER" "$GIT_TOKEN" | base64 | tr -d '\\n')"
                            git -c http.extraheader="$GIT_AUTH_HEADER" \\
                                clone https://github.com/leestana01/gitops.git gitops-repo
                        '''
                        sh """
                            set +x
                            GIT_AUTH_HEADER="Authorization: Basic \$(printf '%s:%s' "\$GIT_USER" "\$GIT_TOKEN" | base64 | tr -d '\\n')"
                            cd gitops-repo
                            sed -i "s|newTag:.*|newTag: ${env.IMAGE_TAG}|" ${env.GITOPS_KUSTOMIZE_DIR}/kustomization.yaml

                            git config user.email "jenkins@klr.kr"
                            git config user.name "Jenkins CI"
                            git add ${env.GITOPS_KUSTOMIZE_DIR}/kustomization.yaml
                            git commit -m "update ${IMAGE_NAME} to ${env.IMAGE_TAG}" || echo "No changes to commit"
                            git -c http.extraheader="\$GIT_AUTH_HEADER" push origin HEAD:main
                        """
                    }
                }
            }
        }
    }

    post {
        success {
            script {
                notifyDiscord('success')
            }
        }
        failure {
            script {
                notifyDiscord('failure')
            }
        }
        aborted {
            script {
                notifyDiscord('aborted')
            }
        }
    }
}

// Discord 알림 헬퍼 — gakhalmo-back 과 동일한 패턴.
//   agent none 인 post 블록에서 sh 를 실행하려면 node context 가 필요하므로
//   curl 만 들어있는 경량 파드를 띄워 webhook POST 만 수행한다.
//   webhook URL 은 "Secret text" credential(Discord-Webhook) 로 주입 — Groovy 레벨
//   노출 없이 shell env 로만 전달된다. 알림 실패가 빌드 결과에 영향을 주지 않도록
//   try/catch 로 감싸 실패는 echo 로만 기록한다.
def notifyDiscord(String status) {
    def color
    def emoji
    def text
    switch (status) {
        case 'success': color = 3066993;  emoji = ':white_check_mark:'; text = 'Success'; break
        case 'failure': color = 15158332; emoji = ':x:';                text = 'Failure'; break
        case 'aborted': color = 15105570; emoji = ':warning:';          text = 'Aborted'; break
        default:        color = 9807270;  emoji = ':information_source:'; text = status
    }
    def jobName   = (env.JOB_NAME   ?: '').toString()
    def buildNum  = (env.BUILD_NUMBER ?: '').toString()
    def branch    = (env.BRANCH_NAME ?: '-').toString()
    def buildUrl  = (env.BUILD_URL  ?: '').toString()
    def targetEnv = (env.TARGET_ENV ?: '-').toString()
    def imageTag  = (env.IMAGE_TAG  ?: '-').toString()
    def duration  = (currentBuild.durationString ?: '-').replace(' and counting', '')

    // podTemplate.label 을 로컬 변수로 바인딩 — kubernetes plugin 버전에 따라
    // POD_LABEL implicit binding 이 주입되지 않는 경우가 있어 node() 인자는
    // 반드시 같은 라벨 문자열을 직접 넘긴다.
    def podLabel = "gakhalmo-front-test-discord-${env.BUILD_NUMBER}"
    // 이미지는 bitnami/kubectl(Debian 기반, curl 포함) 을 사용한다.
    // curlimages/curl 같은 Alpine/busybox 이미지의 /bin/sh 는 durable-task
    // 의 프로세스 종료 감지와 충돌해 `sh` 스텝이 완료 후에도 hang 된다.
    try {
        podTemplate(
            label: podLabel,
            yaml: '''
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: shell
      image: docker.io/bitnami/kubectl:latest
      command: ['cat']
      tty: true
      securityContext:
        runAsUser: 0
      resources:
        requests:
          cpu: '50m'
          memory: '64Mi'
        limits:
          cpu: '200m'
          memory: '128Mi'
'''
        ) {
            node(podLabel) {
                container('shell') {
                    def payload = groovy.json.JsonOutput.toJson([
                        username: 'Jenkins',
                        avatar_url: 'https://www.jenkins.io/images/logos/jenkins/jenkins.png',
                        embeds: [[
                            title: "${emoji} ${jobName} #${buildNum}".toString(),
                            url: buildUrl,
                            color: color,
                            fields: [
                                [name: 'Status',   value: text,      inline: true],
                                [name: 'Branch',   value: branch,    inline: true],
                                [name: 'Env',      value: targetEnv, inline: true],
                                [name: 'Image',    value: imageTag,  inline: true],
                                [name: 'Duration', value: duration,  inline: true]
                            ]
                        ]]
                    ])
                    writeFile file: 'discord-payload.json', text: payload
                    withCredentials([string(credentialsId: 'Discord-Webhook', variable: 'DISCORD_WEBHOOK_URL')]) {
                        sh '''
                            set +x
                            curl -sS --max-time 15 --retry 2 --retry-delay 2 \
                                -o /dev/null -w "discord webhook HTTP %{http_code}\\n" \
                                -H "Content-Type: application/json" \
                                -X POST --data-binary @discord-payload.json \
                                "$DISCORD_WEBHOOK_URL"
                        '''
                    }
                }
            }
        }
    } catch (err) {
        echo "Discord notification failed: ${err.message}"
    }
}
