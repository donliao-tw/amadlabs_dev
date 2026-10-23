FROM nginx:alpine

COPY index.html /usr/share/nginx/html/index.html
COPY assets/ /usr/share/nginx/html/assets/
COPY i18n/ /usr/share/nginx/html/i18n/
COPY iea/ /usr/share/nginx/html/iea/
COPY currency/ /usr/share/nginx/html/currency/
COPY deploy/nginx.container.conf /etc/nginx/conf.d/default.conf
