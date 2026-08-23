FROM nginx:alpine

COPY index.html /usr/share/nginx/html/index.html
COPY assets/ /usr/share/nginx/html/assets/
COPY i18n/ /usr/share/nginx/html/i18n/
COPY deploy/nginx.container.conf /etc/nginx/conf.d/default.conf
