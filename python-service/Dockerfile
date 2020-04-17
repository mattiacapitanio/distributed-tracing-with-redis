FROM python:3.8-alpine

WORKDIR /usr/src/app

RUN apk add --no-cache bash curl 
	# \ && pip install virtualenv 

COPY wait.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/wait.sh

COPY src/requirements.txt ./
RUN pip3 install -r requirements.txt
	# virtualenv venv \
	# && source venv/bin/activate \
	# && pip3 install -r requirements.txt

# ONBUILD RUN virtualenv /env && /env/bin/pip install -r /app/requirements.txt

COPY src .

CMD ["sh"]
