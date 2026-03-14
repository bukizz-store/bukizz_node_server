import 'dotenv/config';
import { SchoolRepository } from './src/repositories/schoolRepository.js';
import { SchoolService } from './src/services/schoolService.js';

async function testSorting() {
  const repository = new SchoolRepository();
  const service = new SchoolService();
  const city = 'Kanpur';
  
  try {
    console.log(`\n--- Test 1: getByCity('${city}') ---`);
    console.log('This repository method uses explicit sorting by sort_order.');
    const schools = await repository.getByCity(city);
    
    if (schools.length > 0) {
      console.log('Schools found (sorted by sort_order ASC, then name ASC):');
      schools.forEach(school => {
        console.log(`- ${school.name} (Sort Order: ${school.sortOrder || 0}, City Code: ${school.cityCode || 'N/A'})`);
      });
    } else {
      console.log('No schools found or error (check database columns).');
    }

    console.log('\n--- Test 2: searchSchools({}) (Default Sorting) ---');
    console.log('This service method tests if the default sortBy is now "sort_order".');
    const searchResult = await service.searchSchools({});
    const searchSchools = searchResult.schools || searchResult.data?.schools || [];
    
    if (searchSchools.length > 0) {
      searchSchools.slice(0, 5).forEach(school => {
        console.log(`- ${school.name} (Sort Order: ${school.sortOrder || 0})`);
      });
    } else {
      console.log('No schools found or error (check database columns).');
    }

    console.log('\nVerification complete. Note: If columns do not exist yet, you will see database errors.');
  } catch (error) {
    console.error('Error during verification:', error);
  }
}

testSorting();
