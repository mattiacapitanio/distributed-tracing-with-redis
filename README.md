# tracing

1. Clone the repo and open the root folder in an IDE like *Visual Studio Code*.

1. Start all microservices with the command:

        docker-compose -f docker-compose.yml up -d --build

1. Visit http://localhost:16686 to view traces.






Architecture

Nodejs App 
- http request
- load data from db
- processing
- saving data on db 
- run python process
- load data from db
- process data 
- saving data on db



Distributed Tracing Components

+-------------------+         +------------------+
|                   |         |                  |
|       Apps        +--------->      Redis       |
|                   |         |                  |
+---------+---------+         +------------------+
          |
          |
+---------v---------+ 
|                   |
|    Jaeger-Agent   |
|                   |
+---------+---------+
          |                     
          |
+---------v---------+         +------------------+
|                   |         |                  |
|  Jaeger-Collector +--------->   Elasticsearch  |
|                   |         |                  |
+---------+---------+         +------------------+
