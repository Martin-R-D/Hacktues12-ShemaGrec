import csv
import json
import argparse
import sys

def calculate_risk_weight(row):
    weight = 0
    incident_type = str(row.get("type", "")).upper()
    
    # Вид инцидент
    if "ЧЕЛНО СБЛЪСКВАНЕ" in incident_type or "ВЛАК" in incident_type:
        weight += 5
    elif "БЛЪСКАНЕ НА ПЕШЕХОДЕЦ" in incident_type:
        weight += 4
    elif "СБЛЪСКВАНЕ МЕЖДУ МПС СТРАНИЧНО" in incident_type or "СБЛЪСКВАНЕ МЕЖДУ МПС ОТЗАД" in incident_type:
        weight += 2
    elif "БЛЪСКАНЕ НА ПАРКИРАНО ППС" in incident_type:
        weight += 1
    
    # Ранени (injured)
    injured_val = str(row.get("injured", "")).strip().lower()
    if injured_val == "да":
        weight += 3
        
    # Загинали (died)
    died_val = str(row.get("died", "")).strip().lower()
    if died_val == "да":
        weight += 7

    return weight

def parse_coordinate(coord_str):
    if not coord_str:
        return 0.0
    # Replace comma with dot for float conversion
    try:
        return float(coord_str.replace(',', '.'))
    except ValueError:
        return 0.0

def generate_json(input_path, output_path):
    output_data = []
    
    with open(input_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        
        for row in reader:
            risk_weight = calculate_risk_weight(row)
            
            cord_x = parse_coordinate(row.get('x'))
            cord_y = parse_coordinate(row.get('y'))
            
            output_data.append({
                "risk_weight": risk_weight,
                "cord_x": cord_x,
                "cord_y": cord_y
            })
            
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
        print(f"Generated {output_path} with {len(output_data)} entries.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generate risk weights from accident CSV.')
    parser.add_argument('input_file', help='Path to the input CSV file')
    parser.add_argument('output_file', help='Path to save the output JSON file')
    args = parser.parse_args()
    
    generate_json(args.input_file, args.output_file)
