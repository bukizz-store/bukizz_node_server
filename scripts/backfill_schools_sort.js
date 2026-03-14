import 'dotenv/config';
import { SchoolRepository } from '../src/repositories/schoolRepository.js';
import { logger } from '../src/utils/logger.js';

/**
 * Script to backfill city_code and sort_order for existing schools
 */
async function backfillSchools() {
  const repository = new SchoolRepository();
  
  try {
    console.log('Fetching all existing schools...');
    // We use search with no filters to get all
    const schools = await repository.search({});
    
    if (!schools || schools.length === 0) {
      console.log('No schools found to backfill.');
      return;
    }

    console.log(`Found ${schools.length} schools. Starting backfill...`);

    // Group schools by city to assign sequential sort_order
    const schoolsByCity = {};
    schools.forEach(school => {
      const city = (school.city || 'Unknown').toLowerCase();
      if (!schoolsByCity[city]) {
        schoolsByCity[city] = [];
      }
      schoolsByCity[city].push(school);
    });

    // Simple city code mapping
    const cityCodeMap = {
      'kanpur': 'KAN',
      'gurgaon': 'GRG',
      'delhi': 'DEL',
      'mumbai': 'MUM',
      'noida': 'NOI',
    };

    let updatedCount = 0;

    for (const city in schoolsByCity) {
      const citySchools = schoolsByCity[city];
      // Sort alphabetically by name first to give a consistent initial sort_order
      citySchools.sort((a, b) => a.name.localeCompare(b.name));

      const city_code = cityCodeMap[city] || city.substring(0, 3).toUpperCase();

      console.log(`\nBackfilling schools for city: ${city} (Code: ${city_code})`);

      for (let i = 0; i < citySchools.length; i++) {
        const school = citySchools[i];
        const sort_order = (i + 1) * 10; // Use increments of 10 for easy insertion later

        process.stdout.write(`- Updating ${school.name}... `);
        
        await repository.update(school.id, {
          cityCode: city_code,
          sortOrder: sort_order
        });
        
        console.log('✅');
        updatedCount++;
      }
    }

    console.log(`\nSuccessfully backfilled ${updatedCount} schools!`);
  } catch (error) {
    console.error('\nError during backfill:', error);
  }
}

backfillSchools();
