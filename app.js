/* By Mark Thien (markthien@gmail.com) */

const axios = require('axios');
const MongoClient = require('mongodb').MongoClient;
const CronJob = require('cron').CronJob;

const tokenZincApi = 'F5C85D26371ABB677F2653F3';
const urlZincApi = 'https://api.zinc.io/v1/products/0923568964/offers?retailer=amazon';
const urlMongoDb = 'mongodb+srv://markthien:hahaha@cluster0-bv9pn.gcp.mongodb.net/test?retryWrites=true&w=majority';
const dbName = 'priceyak';

/*
*
* Function to get connection from Mongodb
*
*/
async function getDbClient () {

  return await MongoClient.connect(urlMongoDb, { useNewUrlParser: true, useUnifiedTopology: true }).catch(err => { 
    console.error('MongoClient.connect', err); 
  });

}

/*
*
* Function to get data of product from Mongodb
*
*/
async function getProductDetailFromZinc () {

  const response = await axios.get(urlZincApi, {
    auth: {
      username: tokenZincApi,
      password: ''
    }
  });

  return response.data.offers;

}

// create a cronjob to run every 15 seconds
const job = new CronJob('*/10 * * * * *', async () => {

  const d = new Date();
  console.log('Checking product price on :', d);

  try {

    let resFromZinc = await getProductDetailFromZinc();

    if (resFromZinc.length < 1) {
      console.log('zinc has no product data so skipping this round');
      return;
    } else {
      console.log(`zinc has ${resFromZinc.length} rows of product data`);
    }

    let client = await getDbClient ();

    if (!client) {
      return;
    }

    // try get data from mongodb
    const collectionProductPrice = client.db(dbName).collection('product_price');
    let resFromDb = await collectionProductPrice.find().sort({ sellerId: 1 }).toArray();

    if (resFromDb.length < 1) { // insert into mongodb if there is no data in mongodb collection
      let arr = [];
      for (const offer of resFromZinc) {
        let objsToInsert = {};
        objsToInsert.currency = offer.currency;
        objsToInsert.price = offer.price;
        objsToInsert.asin = offer.asin;
        objsToInsert.sellerId = offer.seller.id;
        arr.push(objsToInsert);
      }
      collectionProductPrice.insertMany(arr);
    } else { // compare product data from zinc and mongodb to see which product price has dropped
      for (const offer1 of resFromZinc) {
        for (const offer2 of resFromDb) {

          if (offer1.seller.id === offer2.sellerId && offer1.asin === offer2.asin) {

            if (offer1.price < offer2.price) {
              console.log(`price drop for product ${offer1.seller.id} | ${offer1.asin} from ${offer2.price} to ${offer1.price}`);
            } else if (offer1.price > offer2.price) {
              //console.log(`price increase for product ${offer1.seller.id} | ${offer2.asin} from ${offer1.price} to ${offer2.price}`);
            } else {
              //console.log(`price remain the same for ${offer1.seller.id} | ${offer1.asin} | ${offer1.price}`);
            }

          }

        }
      }
    }

  } catch (err) {
    console.error(err.stack);
  }

});

job.start();