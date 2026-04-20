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
                    if (env.BRANCH_NAME == 'main') {
                        env.TARGET_ENV = 'prod'
                        env.GITOPS_KUSTOMIZE_DIR = 'apps/temp-front/overlays/prod'
                    } else if (env.BRANCH_NAME == 'develop') {
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
            echo "Successfully deployed ${IMAGE_NAME}:${env.IMAGE_TAG} to ${env.TARGET_ENV}"
        }
        failure {
            echo "Pipeline failed for ${IMAGE_NAME}"
        }
    }
}
