const express = require('express')
const PORT = 3000
const app = express()

const multer = require("multer")
const AWS = require("aws-sdk")
require("dotenv").config()
const path = require("path")

//cau hinh aws
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = "1"

//cau hinh aws sdk de truy cap vao cloud aws thong qua tai khoan iam user
AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
})

const s3 = new AWS.S3()
const dynamodb = new AWS.DynamoDB.DocumentClient()

const bucketName = process.env.S3_BUCKET_NAME
const tableName = process.env.DYNAMODB_TABLE_NAME

//cau hinh multer manage upload img
const storage = multer.memoryStorage({
    destination(req, file, callback) {
        callback(null, "")
    }
})

const upload = multer({
    storage,
    limits: { fieldSize: 2000000 },
    fileFilter(req, file, cb) {
        checkFileType(file, cb);
    }
})

function checkFileType(file, cb) {
    const fileTypes = /jpeg|jpg|png|gif/

    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = fileTypes.test(file.mimetype);
    if (extname && mimetype) {
        return cb(null, true);
    }
    return cb("Error: pls upload img /jpeg|jpg|png|gif/")
}

//register middleware
app.use(express.urlencoded({ extended: true }))
app.use(express.static('./views'))

//config view
app.set('view engine', 'ejs')
app.set('views', './views');

// app.get('/', (req, resq) => {
//     return resq.render("index", { courses })
// })

app.get("/", async(req, res) => {
    try {
        const params = { TableName: tableName }
        const data = await dynamodb.scan(params).promise()

        //console.log("data=", data.Items)
        return res.render("index.ejs", { data: data.Items })

    } catch (error) {
        console.error("Error data from DynamoDB: ", error)
        return res.status(500).send("server error")
    }
})


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})

app.post('/save', upload.single("HinhAnh"), (req, res) => {
    try {
        const MaSP = Number(req.body.MaSP) //req.body.MaSP     //
        const TenSP = req.body.TenSP
        const SoLuong = Number(req.body.SoLuong) //req.body.SoLuong        //

        const HinhAnh = req.file?.originalname.split(".")
        const fileType = HinhAnh[HinhAnh.length - 1];
        const filePath = `${MaSP}_${Date.now().toString()}.${fileType}`

        const paramsS3 = {
            Bucket: bucketName,
            Key: filePath,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        }

        s3.upload(paramsS3, async(err, data) => {
            if (err) {
                console.error("error=", err)
                return res.send("Internal server error")
            } else {
                const imageURL = data.Location
                const paramsDynamoDb = {
                    TableName: tableName,
                    Item: {
                        MaSP: Number(MaSP),         //MaSP,
                        TenSP: TenSP,
                        SoLuong: SoLuong,
                        HinhAnh: imageURL,
                    }
                }
                await dynamodb.put(paramsDynamoDb).promise()
                return res.redirect('/')
            }
        })
    } catch (error) {
        console.error("Error saving data from dynamodb", error)
        return res.status(500).send("Internal Server Error")
    }
})

app.post("/delete", upload.fields([]),(req, res) => {
    const listCheckboxSelected = Object.keys(req.body)

    if (!listCheckboxSelected || listCheckboxSelected.length <= 0) {
        return res.redirect('/');
    }
    try{
        function onDeleteItem(length) {
            const params = {
                TableName: tableName,
                Key:{
                    MaSP: Number(listCheckboxSelected[length])  //listCheckboxSelected[length]      //
                }
            }

            dynamodb.delete(params, (err, data)=>{
                if(err){
                    console.error('error=', err)
                    return res.send("Internal Server Error!")
                }else if(length>0) onDeleteItem(length - 1)
                else return res.redirect('/')
            })
        }
        onDeleteItem(listCheckboxSelected.length - 1)
    }catch(error){
        console.error('Error deleting data from DynamoDB', error)
        return res.status(500).send('Internal Server Error')
    }
})



