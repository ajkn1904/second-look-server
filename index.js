const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const port = process.env.PORT || 5000;


const app = express();
const jwt = require('jsonwebtoken')

//middleware
app.use(cors());
app.use(express.json());



//jwt verification
const verifyJwt = (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).send('Unauthorized Access');
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded;
        next();
    })
}


//mongodb info
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.7splzic.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


//api function
async function run() {
    try {
        const usersCollection = client.db('secondLook').collection('Users');


        //api fro JWT
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query)
            console.log(user);
            //token implementation
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expireIn: '12h' })
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' })
        })


        //user 
        app.post('/users', async (req, res) => {
            const users = req.body
            const result = await usersCollection.insertOne(users)
            res.send(result)
        })
    }
    finally {

    }
}
run().catch(console.log);




app.get('/', async (req, res) => {
    res.send('Second Look server is running')
});

app.listen(port, () => console.log(`Second Look server is running on ${port}`));