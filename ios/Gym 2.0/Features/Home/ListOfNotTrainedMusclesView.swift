//
//  ListOfNotTrainedMusclesView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.08.24.
//

import SwiftUI

struct ListOfNotTrainedMusclesView: View {
    
    let listOfNotTrainedMuscles: [Muscle]
    
    var body: some View {
        
        VStack(alignment: .leading){
            Text("Not trained yet:")
            ScrollView{
                VStack(alignment: .leading){
                    ForEach(listOfNotTrainedMuscles){ muscle in
                        Text(muscle.name)
                    }
                    .listRowBackground(Color("MyGray"))
                }
            }
            .scrollContentBackground(.hidden)
        }
        .padding(.trailing, 10)
    }
}

