//
//  PastWorkoutsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 20.08.2024.
//

import SwiftUI
import SwiftData

struct PastWorkoutsView: View {
    
    @State var showCSVExport: Bool = false
    @State var showCSVImport: Bool = false
    
    @Query(
        filter: #Predicate <Workout> {$0.inProgress == false},
        sort: [SortDescriptor(\Workout.date, order: .reverse)]
    ) var workouts: [Workout]
    
    var body: some View {
        VStack{
            if workouts.isEmpty{
                Text("You haven't completed any Workouts yet")
            }else{
                VStack{
                    ScrollView{
                        ForEach(workouts){ workout in
                            NavigationLink(value: StatsRoute.pastWorkout(workout)){
                                HStack{
                                    Text(formatDate(date: workout.date))
                                        .padding(.trailing, 10)
                                    Text(workout.name)
                                    Spacer()
                                    
                                }
                                .foregroundStyle(Color("MyWhite"))
                                .font(.headline)
                                .padding(15)
                                .background(
                                    RoundedRectangle(cornerRadius: 5)
                                )
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                    .padding(8)
                }
            }
        }
        
        .sheet(isPresented: $showCSVExport, content:{
            WorkoutExportView(workouts: workouts)
        })
        .sheet(isPresented: $showCSVImport, content:{
            ImportWorkoutsView()
        })
        
        .navigationTitle("Past Workouts")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { toolbarButtons }
        }
    }
    
    var toolbarButtons: some View{
        HStack {
            
            Button(action: {
                showCSVExport.toggle()
            }, label: {
                Image(systemName: "arrow.up.doc")
                    .foregroundStyle(Color("MyBlack"))
                    .font(.headline)
                    .accessibilityLabel("Export workouts")
            })
            .padding(.trailing, 10)
            
            
            Button(action: {
                showCSVImport.toggle()
            }, label: {
                Image(systemName: "arrow.down.doc")
                    .foregroundStyle(Color("MyBlack"))
                    .font(.headline)
                    .accessibilityLabel("Import workouts")
            })
            .padding(.trailing, 10)
        }
    }
    
}
