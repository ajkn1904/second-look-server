const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET)     //stripe secret key


const app = express();
const jwt = require('jsonwebtoken')     //jwt

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
        const categoryCollection = client.db('secondLook').collection('Category');
        const productCollection = client.db('secondLook').collection('Products');
        const ordersCollection = client.db('secondLook').collection('Orders');
        const paymentsCollection = client.db('secondLook').collection('payments');


        //api fro JWT
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query)
            console.log(user);
            //token implementation
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1d' })
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' })
        })


        //api for payment by stripe
        app.post("/create-payment-intent", async (req, res) => {
            const order = req.body;
            const price = order.price;
            const orderAmount = price * 100
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: orderAmount,
                "payment_method_types": ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });



        //api for store the payment info to db
        app.post('/payments', verifyJwt, async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);

            //updating ordersCollection
            const id = payment.orderId
            const query = { _id: ObjectId(id) }
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updatedResult = await ordersCollection.updateOne(query, updatedDoc)


            //updating productsCollection
            const o_id = payment.itemId
            const newQuery = { _id: ObjectId(o_id) }
            const newUpdatedDoc = {
                $set: {
                    status: "sold",
                    advertise: false
                }
            }
            const newUpdatedResult = await productCollection.updateOne(newQuery, newUpdatedDoc)


            res.send(result)
        })


        //is admin account verification
        const verifyAdmin = async (req, res, next) => {
            console.log('inside verifyAdmin', req.decoded.email)
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail }
            const user = await usersCollection.findOne(query)
            if (user.role !== 'Admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }


        //is seller account verification
        const verifySeller = async (req, res, next) => {
            console.log('inside verifySeller', req.decoded.email)
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail }
            const user = await usersCollection.findOne(query)
            if (user.role !== 'Seller') {
                return res.status(403).send({ message: 'forbidden access from verify Seller' })
            }
            next();
        }


        //is buyer account verification
        const verifyBuyer = async (req, res, next) => {
            console.log('inside verifyBuyer', req.decoded.email)
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail }
            const user = await usersCollection.findOne(query)
            if (user.role !== 'Buyer') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }



        //api for creating user on db 
        app.post('/users', async (req, res) => {
            const users = req.body
            const result = await usersCollection.insertOne(users)
            res.send(result)
        })


        //for testing if the user is admin
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email };
            const result = await usersCollection.findOne(filter)
            res.send({ isAdmin: result?.role === 'Admin' })
        })



        //for finding a specific user by email
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email };
            const result = await usersCollection.findOne(filter)
            res.send(result)
        })


        //api for seller verification
        app.put('/users/admin/:id', verifyJwt, verifyAdmin, async (req, res) => {

            const id = req.params.id;
            const cursor = { _id: ObjectId(id) }
            const option = { upsert: true }
            const updatedDoc = {
                $set: {
                    verification: true
                }
            }
            const result = await usersCollection.updateOne(cursor, updatedDoc, option)
            res.send(result);
        })






        // api for loading buyers
        app.get('/buyers', async (req, res) => {
            const filter = { role: 'Buyer' };
            const result = await usersCollection.find(filter).toArray()
            res.send(result)
        })


        // testing if the user is buyer
        app.get('/users/buyers/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email };
            const result = await usersCollection.findOne(filter)
            res.send({ isBuyer: result?.role === 'Buyer' })
        })


        //api for deleting a buyer from database
        app.delete('/buyers/:id', verifyJwt, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await usersCollection.deleteOne(query)
            res.send(result)
        })





        // api for getting user with seller role
        app.get('/sellers', async (req, res) => {
            const filter = { role: 'Seller' };
            const result = await usersCollection.find(filter).toArray()
            res.send(result)
        })


        // testing if the user is seller
        app.get('/users/sellers/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email };
            const result = await usersCollection.findOne(filter)
            res.send({ isSeller: result?.role === 'Seller' })
        })



        //api for deleting a buyer from database
        app.delete('/sellers/:id', verifyJwt, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await usersCollection.deleteOne(query)
            res.send(result)
        })





        //api for loading product category
        app.get('/category', async (req, res) => {
            const query = {}
            const category = await categoryCollection.find(query).toArray()
            res.send(category)
        })


        //api for loading products
        app.get('/category/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { cat_id: id };
            const result = await productCollection.find(filter).toArray();
            res.send(result)
        })




        //api for loading advertised product
        app.get('/advertisedProducts', async (req, res) => {
            const query = { advertise: true }
            const products = await productCollection.find(query).toArray()
            res.send(products)
        })

        

        //api for loading a recently added products with limit
        app.get('/products/recent', async (req, res) => {
            const query = { status: 'available' };
            const cursor = productCollection.find(query);
            const result = await cursor.sort({ _id: -1 }).limit(6).toArray();
            res.send(result);
        });



        //api for loading a product using id
        app.get('/product/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await productCollection.findOne(filter);
            res.send(result)
        })


        //api for adding products
        app.post('/product', verifyJwt, verifySeller, async (req, res) => {
            const product = req.body;
            const result = await productCollection.insertOne(product)
            res.send(product);
        })



        //api for loading reported product
        app.get('/reportedProducts', async (req, res) => {
            const query = { reported: true }
            const result = await productCollection.find(query).toArray()
            res.send(result)
        })



        //api for report a product
        app.put('/product/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const option = { upsert: true }
            const updatedDoc = {
                $set: {
                    reported: true
                }
            }
            const result = await productCollection.updateOne(query, updatedDoc, option)
            res.send(result)

        })

        //api for update reported status for a reported product
        app.put('/admin/product/:id', verifyJwt, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const option = { upsert: true }
            const updatedDoc = {
                $set: {
                    reported: false
                }
            }
            const result = await productCollection.updateOne(query, updatedDoc, option)
            res.send(result)

        })



        //api for deleting a reported product from database
        app.delete('/admin/products/:id', verifyJwt, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await productCollection.deleteOne(query)
            res.send(result)
        })




        //api for getting sellers added products
        app.get('/sellers/products', verifyJwt, verifySeller, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;

            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = { sellerEmail: email };
            const product = await productCollection.find(query).toArray();
            res.send(product);
        })


        //api for updating a product on database
        app.put('/seller/products/:id', verifyJwt, verifySeller, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const option = { upsert: true }
            const updatedDoc = {
                $set: {
                    advertise: true
                }
            }
            const result = await productCollection.updateOne(query, updatedDoc, option)
            res.send(result)
        })



        //api for deleting a product from database
        app.delete('/seller/products/:id', verifyJwt, verifySeller, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await productCollection.deleteOne(query)
            res.send(result)
        })




        //api for ordering a product
        app.post('/orders', async (req, res) => {
            const order = req.body;
            const result = await ordersCollection.insertOne(order)
            res.send(result)
        })


        //api for loading my orders
        app.get('/orders', verifyJwt, verifyBuyer, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;

            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = { userEmail: email };
            const orders = await ordersCollection.find(query).toArray();
            res.send(orders);
        })

        //api for getting orders by id
        app.get('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await ordersCollection.findOne(query)
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