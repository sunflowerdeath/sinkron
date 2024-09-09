import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";

/*
{
  accessKeyId: '<account_name>', // <--- заменить
  secretAccessKey: '<secret_key>', // <--- заменить
  endpoint: 'https://s3.timeweb.cloud',
  s3ForcePathStyle: true,
  region: 'ru-1',
  apiVersion: 'latest',
}
*/
const { SINKRON_S3_OPTIONS, SINKRON_S3_BUCKET } = process.env
const s3 = new S3(JSON.parse(SINKRON_S3_OPTIONS))

const command = { 
    Bucket: SINKRON_S3_BUCKET,
    Key: `spaces/${spaceId}/files/${id}`, // ?
    Body: '...',
    Metadata: { // Metadata
      "<keys>": "STRING_VALUE",
    }
}

try {
  const data = await client.send(command);
  // process data.
} catch (error) {
  // error handling.
} finally {
  // finally.
}

*/
