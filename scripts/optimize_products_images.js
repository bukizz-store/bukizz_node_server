import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from Bukizz/server/.env
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'products';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/**
 * Recursively list all files in a bucket path
 */
async function listAllFiles(folderPath = '') {
  let allFiles = [];
  let page = 0;
  const pageSize = 100;

  while (true) {
    const { data: items, error } = await supabase.storage
      .from(BUCKET)
      .list(folderPath, { limit: pageSize, offset: page * pageSize });

    if (error) {
      console.error(`❌ Error listing files at path "${folderPath}":`, error);
      throw error;
    }

    if (!items || items.length === 0) break;

    for (const item of items) {
      const itemFullPath = folderPath ? `${folderPath}/${item.name}` : item.name;
      // If item.id is null, it's a subfolder
      if (item.id === null) {
        const subFiles = await listAllFiles(itemFullPath);
        allFiles = allFiles.concat(subFiles);
      } else {
        allFiles.push({ ...item, fullPath: itemFullPath });
      }
    }

    if (items.length < pageSize) break;
    page++;
  }

  return allFiles;
}

/**
 * Verify WebP image on Supabase storage by downloading it
 */
async function verifyWebpImage(filePath) {
  const { data: blob, error } = await supabase.storage.from(BUCKET).download(filePath);
  if (error || !blob) {
    console.error(`  ❌ Verification FAILED for ${filePath}:`, error?.message || 'Empty blob');
    return false;
  }

  const arrayBuf = await blob.arrayBuffer();
  if (arrayBuf.byteLength === 0) {
    console.error(`  ❌ Verification FAILED for ${filePath}: 0 bytes download`);
    return false;
  }

  // Quick check on WebP header (RIFF ... WEBP)
  const header = Buffer.from(arrayBuf.slice(0, 12)).toString('utf8');
  if (!header.startsWith('RIFF') || !header.includes('WEBP')) {
    console.error(`  ❌ Verification FAILED for ${filePath}: Header does not match WebP format (${header})`);
    return false;
  }

  return true;
}

async function optimizeProductsImages() {
  console.log(`🚀 Starting Image Optimization for bucket "${BUCKET}"...`);
  console.log(`📍 Supabase URL: ${SUPABASE_URL}\n`);

  const files = await listAllFiles();
  console.log(`📦 Total items found in bucket: ${files.length}`);

  const targetFiles = files.filter((f) => /\.(jpg|jpeg|png)$/i.test(f.name));
  console.log(`🖼️  Image files to process (.jpg, .jpeg, .png): ${targetFiles.length}\n`);

  if (targetFiles.length === 0) {
    console.log('✨ No PNG/JPG images to optimize.');
    return;
  }

  let totalOriginalSize = 0;
  let totalOptimizedSize = 0;
  let processedCount = 0;
  let dbUpdatedCount = 0;
  let deletedOriginalCount = 0;

  for (let i = 0; i < targetFiles.length; i++) {
    const file = targetFiles[i];
    const originalFullPath = file.fullPath;
    const originalSize = file.metadata?.size || 0;
    totalOriginalSize += originalSize;

    console.log(`--------------------------------------------------`);
    console.log(`[${i + 1}/${targetFiles.length}] 🔍 Processing: ${originalFullPath} (${(originalSize / 1024).toFixed(2)} KB)`);

    // 1. Download original file
    const { data: blob, error: dlError } = await supabase.storage
      .from(BUCKET)
      .download(originalFullPath);

    if (dlError || !blob) {
      console.error(`  ❌ Error downloading ${originalFullPath}:`, dlError?.message);
      continue;
    }

    const inputBuffer = Buffer.from(await blob.arrayBuffer());

    // 2. Compress to WebP using Sharp
    let optimizedBuffer;
    try {
      optimizedBuffer = await sharp(inputBuffer)
        .webp({ quality: 82, effort: 6 })
        .toBuffer();
    } catch (err) {
      console.error(`  ❌ Sharp processing error for ${originalFullPath}:`, err.message);
      continue;
    }

    const optimizedSize = optimizedBuffer.byteLength;
    const savingsPercent = originalSize > 0
      ? (((originalSize - optimizedSize) / originalSize) * 100).toFixed(1)
      : 0;

    console.log(`  ⚡ Sharp optimized: ${(optimizedSize / 1024).toFixed(2)} KB (${savingsPercent}% reduction)`);

    // 3. Prepare WebP filename and upload
    const newFullPath = originalFullPath.replace(/\.[^/.]+$/, '') + '.webp';
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(newFullPath, optimizedBuffer, {
      contentType: 'image/webp',
      upsert: true,
    });

    if (uploadError) {
      console.error(`  ❌ Error uploading WebP file ${newFullPath}:`, uploadError.message);
      continue;
    }

    totalOptimizedSize += optimizedSize;
    processedCount++;

    // 4. PRODUCTION SAFETY CHECK: Verify WebP image Integrity for downloadable renderability
    console.log(`  🧪 Verifying WebP image Integrity for ${newFullPath}...`);
    const isVerified = await verifyWebpImage(newFullPath);

    if (!isVerified) {
      console.error(`  ⚠️ WebP verification failed for ${newFullPath}. Original file kept: ${originalFullPath}`);
      continue;
    }
    console.log(`  ✅ WebP image verified successfully!`);

    // 5. Update database references in 'product_images' and 'product_option_values' tables
    // 5a. product_images
    const { data: imgRows, error: imgSearchError } = await supabase
      .from('product_images')
      .select('id, url')
      .like('url', `%${originalFullPath}%`);

    if (!imgSearchError && imgRows && imgRows.length > 0) {
      for (const row of imgRows) {
        if (row.url) {
          const updatedUrl = row.url.replace(originalFullPath, newFullPath);
          const { error: updateError } = await supabase
            .from('product_images')
            .update({ url: updatedUrl })
            .eq('id', row.id);

          if (updateError) {
            console.error(`  ❌ Failed to update product_images ID ${row.id}:`, updateError.message);
          } else {
            console.log(`  🔄 Updated product_images [${row.id}]: ${row.url} -> ${updatedUrl}`);
            dbUpdatedCount++;
          }
        }
      }
    }

    // 5b. product_option_values
    const { data: optRows, error: optSearchError } = await supabase
      .from('product_option_values')
      .select('id, image_url')
      .like('image_url', `%${originalFullPath}%`);

    if (!optSearchError && optRows && optRows.length > 0) {
      for (const row of optRows) {
        if (row.image_url) {
          const updatedUrl = row.image_url.replace(originalFullPath, newFullPath);
          const { error: updateError } = await supabase
            .from('product_option_values')
            .update({ image_url: updatedUrl })
            .eq('id', row.id);

          if (updateError) {
            console.error(`  ❌ Failed to update product_option_values ID ${row.id}:`, updateError.message);
          } else {
            console.log(`  🔄 Updated product_option_values [${row.id}]: ${row.image_url} -> ${updatedUrl}`);
            dbUpdatedCount++;
          }
        }
      }
    }

    // 6. Safe Cleanup: Delete original JPG/PNG only AFTER verification & DB update
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove([originalFullPath]);

    if (removeError) {
      console.error(`  ⚠️ Could not remove original file ${originalFullPath}:`, removeError.message);
    } else {
      console.log(`  🗑️  Original file deleted safely: ${originalFullPath}`);
      deletedOriginalCount++;
    }
  }

  console.log(`\n==================================================`);
  console.log(`🎉 Optimization Complete!`);
  console.log(`📊 Images Processed: ${processedCount} / ${targetFiles.length}`);
  console.log(`💾 Database Rows Updated: ${dbUpdatedCount}`);
  console.log(`🗑️  Original Files Deleted: ${deletedOriginalCount}`);
  console.log(`📈 Original Total Size: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`📉 Optimized Total Size: ${(totalOptimizedSize / 1024 / 1024).toFixed(2)} MB`);
  const totalSavings = totalOriginalSize > 0
    ? (((totalOriginalSize - totalOptimizedSize) / totalOriginalSize) * 100).toFixed(1)
    : 0;
  console.log(`✨ Total Storage Saved: ${totalSavings}% reduction`);
  console.log(`==================================================`);
}

optimizeProductsImages().catch((err) => {
  console.error('❌ Fatal error running optimization script:', err);
  process.exit(1);
});
